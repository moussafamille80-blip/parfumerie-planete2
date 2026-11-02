import os
from datetime import datetime
from flask import Flask, render_template, request, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "planete2-parfumerie-secret-2025")

# --- CONNEXION BASE DE DONNÉES (Vercel Marketplace / Neon) ---
# Vercel injecte DATABASE_URL automatiquement via l'intégration Storage
database_url = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")

if database_url:
    # SQLAlchemy exige "postgresql://" et non "postgres://" [citation:2]
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    app.config["SQLALCHEMY_DATABASE_URI"] = database_url
else:
    # Fallback pour développement local (si DATABASE_URL absent)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///stock_local.db"

app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)


# --- MODÈLES ---
class Produit(db.Model):
    __tablename__ = "produits"
    id = db.Column(db.Integer, primary_key=True)
    nom = db.Column(db.String(150), nullable=False)
    marque = db.Column(db.String(100), default="")
    categorie = db.Column(db.String(100), default="")
    contenance_ml = db.Column(db.Integer, default=0)
    prix_achat = db.Column(db.Float, default=0)
    prix_vente = db.Column(db.Float, default=0)
    quantite = db.Column(db.Integer, default=0)
    seuil_alerte = db.Column(db.Integer, default=5)
    code_barre = db.Column(db.String(50), unique=True, nullable=True)


class Mouvement(db.Model):
    __tablename__ = "mouvements"
    id = db.Column(db.Integer, primary_key=True)
    produit_id = db.Column(db.Integer, db.ForeignKey("produits.id"), nullable=False)
    type = db.Column(db.String(10), nullable=False)  # ENTREE ou SORTIE
    quantite = db.Column(db.Integer, nullable=False)
    prix_unitaire = db.Column(db.Float, default=0)
    note = db.Column(db.String(255), default="")
    date_mouvement = db.Column(db.String(30), nullable=False)

    produit = db.relationship("Produit", backref=db.backref("mouvements", lazy=True))


# --- CRÉATION DES TABLES AU DÉMARRAGE ---
with app.app_context():
    db.create_all()


# --- ROUTES ---

@app.route("/")
def dashboard():
    nb_produits = Produit.query.count()
    total_qte = db.session.query(db.func.coalesce(db.func.sum(Produit.quantite), 0)).scalar()

    val_achat = db.session.query(
        db.func.coalesce(db.func.sum(Produit.quantite * Produit.prix_achat), 0)
    ).scalar()
    val_vente = db.session.query(
        db.func.coalesce(db.func.sum(Produit.quantite * Produit.prix_vente), 0)
    ).scalar()

    alertes = Produit.query.filter(Produit.quantite <= Produit.seuil_alerte).all()

    return render_template(
        "dashboard.html",
        nb=nb_produits, qte=total_qte,
        val_achat=val_achat, val_vente=val_vente,
        marge=val_vente - val_achat, alertes=alertes
    )


@app.route("/produits")
def produits():
    recherche = request.args.get("q", "").strip()
    if recherche:
        produits_list = Produit.query.filter(
            db.or_(
                Produit.nom.ilike(f"%{recherche}%"),
                Produit.marque.ilike(f"%{recherche}%")
            )
        ).order_by(Produit.nom).all()
    else:
        produits_list = Produit.query.order_by(Produit.nom).all()
    return render_template("produits.html", produits=produits_list, recherche=recherche)


@app.route("/produit/ajouter", methods=["GET", "POST"])
def ajouter_produit():
    if request.method == "POST":
        try:
            p = Produit(
                nom=request.form["nom"].strip(),
                marque=request.form.get("marque", "").strip(),
                categorie=request.form.get("categorie", "").strip(),
                contenance_ml=int(request.form.get("contenance_ml") or 0),
                prix_achat=float(request.form.get("prix_achat") or 0),
                prix_vente=float(request.form.get("prix_vente") or 0),
                quantite=int(request.form.get("quantite") or 0),
                seuil_alerte=int(request.form.get("seuil_alerte") or 5),
                code_barre=request.form.get("code_barre", "").strip() or None
            )
            db.session.add(p)
            db.session.commit()
            flash("Produit ajouté avec succès !", "success")
        except Exception as e:
            db.session.rollback()
            flash(f"Erreur : {str(e)}", "danger")
        return redirect(url_for("produits"))

    return render_template("produits.html", produits=Produit.query.order_by(Produit.nom).all(), recherche="", edit_mode=True)


@app.route("/produit/supprimer/<int:pid>")
def supprimer_produit(pid):
    p = Produit.query.get_or_404(pid)
    db.session.delete(p)
    db.session.commit()
    flash("Produit supprimé.", "info")
    return redirect(url_for("produits"))


@app.route("/mouvement/<type_mvt>", methods=["GET", "POST"])
def mouvement(type_mvt):
    if type_mvt not in ("ENTREE", "SORTIE"):
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        try:
            pid = int(request.form["produit_id"])
            qte = int(request.form["quantite"])
            prix = float(request.form.get("prix_unitaire") or 0)
            note = request.form.get("note", "")

            produit = Produit.query.get(pid)
            if not produit:
                flash("Produit introuvable.", "danger")
                return redirect(url_for("mouvement", type_mvt=type_mvt))

            if type_mvt == "SORTIE" and produit.quantite < qte:
                flash(f"Stock insuffisant (disponible : {produit.quantite}).", "danger")
                return redirect(url_for("mouvement", type_mvt=type_mvt))

            if type_mvt == "ENTREE":
                produit.quantite += qte
            else:
                produit.quantite -= qte

            m = Mouvement(
                produit_id=pid,
                type=type_mvt,
                quantite=qte,
                prix_unitaire=prix,
                note=note,
                date_mouvement=datetime.now().isoformat(timespec="seconds")
            )
            db.session.add(m)
            db.session.commit()
            flash(f"{'Entrée' if type_mvt == 'ENTREE' else 'Sortie'} enregistrée !", "success")
        except Exception as e:
            db.session.rollback()
            flash(f"Erreur : {str(e)}", "danger")

        return redirect(url_for("mouvement", type_mvt=type_mvt))

    produits_list = Produit.query.order_by(Produit.nom).all()
    derniers = Mouvement.query.order_by(Mouvement.date_mouvement.desc()).limit(10).all()
    return render_template("mouvement.html", type_mvt=type_mvt, produits=produits_list, derniers=derniers)


@app.route("/historique")
def historique():
    mouvements = Mouvement.query.order_by(Mouvement.date_mouvement.desc()).limit(200).all()
    return render_template("historique.html", mouvements=mouvements)


if __name__ == "__main__":
    app.run(debug=True)