import os
from datetime import datetime
from flask import Flask, render_template, request, redirect, url_for, flash, session
import libsql_client

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "planete2-parfumerie-secret")

# --- CONNEXION TURSO (Cloud SQLite compatible Vercel) ---
TURSO_URL = os.environ.get("TURSO_DATABASE_URL")
TURSO_TOKEN = os.environ.get("TURSO_AUTH_TOKEN")

def get_db():
    """Retourne un client Turso pour chaque requête."""
    if not TURSO_URL or not TURSO_TOKEN:
        raise RuntimeError("Variables Turso manquantes. Ajoutez TURSO_DATABASE_URL et TURSO_AUTH_TOKEN dans Vercel.")
    return libsql_client.create_client(url=TURSO_URL, auth_token=TURSO_TOKEN)

def init_db():
    """Initialise les tables (appelée manuellement une fois)."""
    client = get_db()
    client.execute("""
        CREATE TABLE IF NOT EXISTS produits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT NOT NULL,
            marque TEXT,
            categorie TEXT,
            contenance_ml INTEGER DEFAULT 0,
            prix_achat REAL DEFAULT 0,
            prix_vente REAL DEFAULT 0,
            quantite INTEGER DEFAULT 0,
            seuil_alerte INTEGER DEFAULT 5,
            code_barre TEXT UNIQUE
        )
    """)
    client.execute("""
        CREATE TABLE IF NOT EXISTS mouvements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            produit_id INTEGER NOT NULL,
            type TEXT CHECK(type IN ('ENTREE','SORTIE')),
            quantite INTEGER NOT NULL,
            prix_unitaire REAL DEFAULT 0,
            note TEXT,
            date_mouvement TEXT NOT NULL
        )
    """)
    client.close()

# --- ROUTES ---

@app.route("/")
def dashboard():
    client = get_db()
    # Stats
    res = client.execute("SELECT COUNT(*) as nb, COALESCE(SUM(quantite),0) as qte FROM produits").rows[0]
    nb_produits = res[0]
    total_qte = res[1]
    
    res_val = client.execute("""
        SELECT COALESCE(SUM(quantite * prix_achat),0), COALESCE(SUM(quantite * prix_vente),0) FROM produits
    """).rows[0]
    val_achat = res_val[0]
    val_vente = res_val[1]
    
    alertes = client.execute("SELECT * FROM produits WHERE quantite <= seuil_alerte").rows
    client.close()
    
    return render_template("dashboard.html", 
                           nb=nb_produits, qte=total_qte, 
                           val_achat=val_achat, val_vente=val_vente,
                           marge=val_vente - val_achat, alertes=alertes)

@app.route("/produits")
def produits():
    client = get_db()
    recherche = request.args.get("q", "")
    if recherche:
        rows = client.execute(
            "SELECT * FROM produits WHERE nom LIKE ? OR marque LIKE ? ORDER BY nom",
            (f"%{recherche}%", f"%{recherche}%")
        ).rows
    else:
        rows = client.execute("SELECT * FROM produits ORDER BY nom").rows
    client.close()
    return render_template("produits.html", produits=rows, recherche=recherche)

@app.route("/produit/ajouter", methods=["GET", "POST"])
def ajouter_produit():
    if request.method == "POST":
        client = get_db()
        client.execute("""
            INSERT INTO produits (nom, marque, categorie, contenance_ml, prix_achat, prix_vente, quantite, seuil_alerte, code_barre)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            request.form["nom"],
            request.form.get("marque", ""),
            request.form.get("categorie", ""),
            int(request.form.get("contenance_ml") or 0),
            float(request.form.get("prix_achat") or 0),
            float(request.form.get("prix_vente") or 0),
            int(request.form.get("quantite") or 0),
            int(request.form.get("seuil_alerte") or 5),
            request.form.get("code_barre") or None
        ))
        client.close()
        flash("Produit ajouté avec succès !", "success")
        return redirect(url_for("produits"))
    return render_template("produits.html", produits=[], recherche="", edit_mode=True)

@app.route("/produit/supprimer/<int:pid>")
def supprimer_produit(pid):
    client = get_db()
    client.execute("DELETE FROM produits WHERE id = ?", (pid,))
    client.close()
    flash("Produit supprimé.", "info")
    return redirect(url_for("produits"))

@app.route("/mouvement/<type_mvt>", methods=["GET", "POST"])
def mouvement(type_mvt):
    if type_mvt not in ("ENTREE", "SORTIE"):
        return redirect(url_for("dashboard"))
    
    client = get_db()
    
    if request.method == "POST":
        pid = int(request.form["produit_id"])
        qte = int(request.form["quantite"])
        prix = float(request.form.get("prix_unitaire") or 0)
        note = request.form.get("note", "")
        
        # Vérification stock pour sortie
        row = client.execute("SELECT quantite FROM produits WHERE id = ?", (pid,)).rows
        if not row:
            flash("Produit introuvable.", "danger")
            return redirect(url_for("mouvement", type_mvt=type_mvt))
        
        stock = row[0][0]
        if type_mvt == "SORTIE" and stock < qte:
            flash(f"Stock insuffisant (disponible : {stock}).", "danger")
            return redirect(url_for("mouvement", type_mvt=type_mvt))
        
        # Mise à jour stock
        new_qte = stock + qte if type_mvt == "ENTREE" else stock - qte
        client.execute("UPDATE produits SET quantite = ? WHERE id = ?", (new_qte, pid))
        
        # Enregistrement mouvement
        client.execute("""
            INSERT INTO mouvements (produit_id, type, quantite, prix_unitaire, note, date_mouvement)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (pid, type_mvt, qte, prix, note, datetime.now().isoformat(timespec="seconds")))
        
        client.close()
        flash(f"{'Entrée' if type_mvt=='ENTREE' else 'Sortie'} enregistrée !", "success")
        return redirect(url_for("mouvement", type_mvt=type_mvt))
    
    # GET : afficher le formulaire
    produits_list = client.execute("SELECT * FROM produits ORDER BY nom").rows
    derniers = client.execute("""
        SELECT m.*, p.nom as produit_nom FROM mouvements m 
        JOIN produits p ON p.id = m.produit_id 
        ORDER BY m.date_mouvement DESC LIMIT 10
    """).rows
    client.close()
    
    return render_template("mouvement.html", type_mvt=type_mvt, produits=produits_list, derniers=derniers)

@app.route("/historique")
def historique():
    client = get_db()
    rows = client.execute("""
        SELECT m.*, p.nom as produit_nom, p.marque as produit_marque 
        FROM mouvements m 
        JOIN produits p ON p.id = m.produit_id 
        ORDER BY m.date_mouvement DESC LIMIT 200
    """).rows
    client.close()
    return render_template("historique.html", mouvements=rows)

# Route d'initialisation (à appeler une seule fois après déploiement)
@app.route("/init-db")
def init_db_route():
    try:
        init_db()
        return "Base de données initialisée avec succès !"
    except Exception as e:
        return f"Erreur : {e}"

if __name__ == "__main__":
    app.run(debug=True)