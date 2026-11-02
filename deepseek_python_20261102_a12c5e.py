import os
from flask import Flask, render_template, request, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "planete2-secret")

# Vercel injecte généralement DATABASE_URL ou POSTGRES_URL
# On s'assure que l'URI commence par postgresql:// (et non postgres://)
database_url = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
if database_url and database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# --- Vos modèles (exemple simplifié) ---
class Produit(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nom = db.Column(db.String(100), nullable=False)
    prix_achat = db.Column(db.Float, default=0)
    prix_vente = db.Column(db.Float, default=0)
    quantite = db.Column(db.Integer, default=0)

# --- Création des tables au démarrage ---
with app.app_context():
    db.create_all()

# ... vos routes ...