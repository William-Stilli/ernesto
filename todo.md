# TODO

# - [ ] Remplacer la méthode purchase pour utiliser les normes ACID - LATE

# - [ ] Modifier le client RCON pour qu'en cas de player non connecté, il mette en cache la commande et la traite a la reconnexion

# - [ ] Ajouter un système de cache pour les commandes RCON

### ☐ Développement du Mod Serveur (FabricMC)

C'est la partie manquante essentielle pour l'interaction en jeu.

- **[ ] Setup de l'environnement :** Mettre en place l'environnement de développement FabricMC (Java, IDE, Gradle).
- **[ ] Implémentation Commande `/login` :**
  - [ ] Enregistrer la commande.
  - [ ] Générer un code aléatoire à 6 chiffres.
  - [ ] **Appeler l'API :** `POST /api/internal/store-code` avec le pseudo, le code, et le header `X-Api-Key` (depuis une config serveur sécurisée). Gérer la réponse de l'API.
  - [ ] Envoyer le code généré **en privé** au joueur (pas dans le chat public).
- **[ ] Implémentation Commande `/sellitem <prix>` (ou similaire) :**
  - [ ] Enregistrer la commande avec un argument pour le prix.
  - [ ] Récupérer l'item tenu en main par le joueur (ID, quantité, nom, description, NBT si besoin).
  - [ ] Valider si l'item peut être vendu.
  - [ ] **Retirer l'item** de l'inventaire du joueur _avant_ d'appeler l'API.
  - [ ] **Appeler l'API :** `POST /api/internal/sell` avec les détails de l'item, le prix, le pseudo du vendeur, et le header `X-Api-Key`. Gérer la réponse.
  - [ ] Envoyer un message de confirmation/erreur au joueur.
- **[ ] Implémentation Commande `/redeem` (ou `/claim`) :**
  - [ ] Enregistrer la commande.
  - [ ] **Appeler l'API :** `GET /api/internal/pending-deliveries?username=...` avec le header `X-Api-Key` pour obtenir la liste des items en attente.
  - [ ] Si des items sont retournés :
    - [ ] Parcourir la liste.
    - [ ] Essayer de donner chaque item au joueur via **l'API FabricMC d'inventaire** (préférable à RCON).
    - [ ] Garder la trace des `deliveryId` des items **effectivement donnés**.
    - [ ] Gérer le cas d'inventaire plein (informer le joueur, ne pas confirmer la livraison pour cet item).
  - [ ] Si au moins un item a été donné :
    - [ ] **Appeler l'API :** `POST /api/internal/confirm-delivery` avec les `deliveryId` des items donnés et le header `X-Api-Key`.
  - [ ] Envoyer un message récapitulatif au joueur.
- **[ ] Gestion Sécurisée de `INTERNAL_API_KEY` :** Charger la clé depuis un fichier de configuration serveur, ne pas la coder en dur dans le mod.
- **[ ] Gestion d'Erreurs et Feedback :** Fournir des messages clairs aux joueurs en cas de succès ou d'échec des commandes. Logguer les erreurs côté serveur mod.

### ☐ Améliorations et Robustesse de l'API

- **[ ] Rétablir les Transactions ACID :**
  - [ ] Configurer MongoDB pour utiliser un **Replica Set** (même avec un seul nœud en développement via Docker).
  - [ ] **Réintroduire** `session.withTransaction` dans la logique `POST /api/shop/purchase` pour garantir l'atomicité des échanges joueur-joueur (débit acheteur + crédit vendeur + suppression offre).
- **[ ] Validation d'Entrées :** Implémenter une validation plus stricte pour tous les `req.body` et `req.query` (par exemple avec `express-validator`).
- **[ ] Gestion d'Erreurs :** Améliorer les logs serveur, potentiellement standardiser les formats de réponse d'erreur.
- **[ ] Sécurité Renforcée :**
  - [ ] Ajouter du **Rate Limiting** aux endpoints sensibles (`/login`, `/refresh`, `/purchase`...).
  - [ ] (Optionnel) Hasher les Refresh Tokens avant de les stocker en base de données.
  - [ ] S'assurer de l'utilisation de HTTPS en production.
- **[ ] Simplification RCON :** Revenir à une version simple de `sendRconCommand` qui renvoie juste succès/échec + message, car la logique de file d'attente est maintenant gérée par `PendingDelivery`.
- **[ ] Notifications (Optionnel) :** Mettre en place un système (ex: WebSockets) pour notifier un vendeur quand son item est acheté.
- **[ ] Endpoints de Gestion (Optionnel) :** Créer des endpoints sécurisés pour les administrateurs pour voir/gérer les utilisateurs, les offres, les livraisons en attente, etc.

### ☐ Développement de l'Interface Shop (Frontend)

- [ ] Créer l'interface utilisateur pour afficher les offres (`GET /api/shop/items`), en différenciant visuellement les offres Admin / Joueur.
- [ ] Implémenter le formulaire de login (Pseudo + Code Temporaire) qui appelle `POST /api/auth/login`.
- [ ] **Stockage Sécurisé des Tokens :** Stocker l'Access Token (ex: mémoire, sessionStorage) et le Refresh Token (ex: cookie HttpOnly si possible, sinon localStorage avec précautions XSS).
- [ ] Implémenter la **logique de rafraîchissement automatique** de l'Access Token en interceptant les erreurs "token expiré" et en appelant `POST /api/auth/refresh`.
- [ ] Implémenter la logique d'achat en appelant `POST /api/shop/purchase` avec le `listingId` et le Bearer Token. Gérer les réponses `delivered` et `pending_delivery`.
- [ ] Implémenter la déconnexion (`POST /api/auth/logout`, suppression des tokens locaux).
- [ ] (Optionnel) Interface pour voir ses propres offres ou son historique.

### ☐ Déploiement et Production

- [ ] Configurer MongoDB en Replica Set pour la production.
- [ ] Préparer l'API Node.js pour la production (ex: PM2, Docker).
- [ ] Gérer les variables d'environnement de manière sécurisée.
- [ ] Mettre en place HTTPS (ex: via un reverse proxy comme Nginx ou Caddy).
