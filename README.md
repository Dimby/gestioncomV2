# GestionComV2

Application locale de gestion de stock pour un multiservice.

## Stack

- Backend: Node.js natif (`http`, `fs`, `crypto`)
- Base locale: fichier JSON chiffre (`data/store.enc`)
- Frontend: HTML, CSS, JavaScript vanilla

## Profils

- Vendeur: acces libre a la page `Ventes` pour ajouter, modifier, supprimer et consulter les ventes.
- Admin: acces protege par mot de passe pour le tableau de bord, produits, approvisionnement, services, activite et assistant.

La racine `/` ouvre directement l'espace vendeur. La connexion admin se fait sur `http://127.0.0.1:3000/admin-login.html`.

## Modele metier actuel

- Produits: catalogue, prix de vente, cout d'achat, unite, seuil de reapprovisionnement
- Services: catalogue et tarif de base
- Stock: mouvements d'entree et sorties automatiques lors des ventes
- Ventes: lignes produit/service, reference de vente, paiement, solde restant
- Caisse: journal d'entrees/sorties
- Activite: historique recent des operations
- Assistant local: page `Chat avec IA` pour questions metier ciblees sur marge mensuelle, valeur de vente theorique du stock et produit le plus vendu sur un mois

## Lancer le projet

```bash
cp .env.example .env
node src/server.js
```

Puis ouvrir `http://127.0.0.1:3000`.

## Notes

- Le chiffrement utilise AES-256-GCM.
- En local, si `APP_SECRET` n'est pas defini, une cle de developpement est utilisee.
- Le fichier chiffre est cree automatiquement au premier lancement.
- Definir `ADMIN_PASSWORD` dans `.env` pour remplacer le mot de passe admin par defaut.
