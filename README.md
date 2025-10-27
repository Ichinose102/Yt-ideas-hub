# YT-Ideas-Hub 💡

## Description du Projet
YT-Ideas-Hub est une application web simple et minimaliste conçue pour gérer et organiser des idées de contenu (pour YouTube, un blog, ou tout autre projet). C'est une application Full-Stack complète (CRUD) développée dans un environnement Node.js.

## Stack Technique
* **Backend & Serveur :** Node.js & Express
* **Base de Données :** NeDB (Base de données simple basée sur fichier, parfaite pour les prototypes locaux)
* **Templating (Frontend) :** EJS (Embedded JavaScript)
* **Développement :** Nodemon (pour le rechargement automatique)

## Fonctionnalités Implémentées (CRUD)
L'application permet d'effectuer les quatre opérations fondamentales :

| Opération | Méthode & Route | Description |
| :--- | :--- | :--- |
| **Créer** | `POST /idea` | Ajout d'une nouvelle idée à la base de données. |
| **Lire** | `GET /` | Affichage de toutes les idées dans une grille. |
| **Modifier** | `GET /edit/:id` & `POST /edit/update/:id` | Affichage d'un formulaire pré-rempli et mise à jour des données. |
| **Supprimer** | `POST /idea/delete/:id` | Suppression définitive d'une idée. |

## Installation et Lancement

Pour démarrer ce projet sur votre machine locale :

### Prérequis
Vous devez avoir [Node.js](https://nodejs.org/en/) installé sur votre système.

### Étapes
1.  **Cloner le Repository**
    ```bash
    git clone [VOTRE LIEN GITHUB ICI]
    cd yt-ideas-hub
    ```

2.  **Installer les Dépendances**
    Installe tous les packages nécessaires (Express, NeDB, EJS, nodemon) définis dans `package.json`.
    ```bash
    npm install
    ```

3.  **Lancer le Serveur**
    Utilisez le script `dev` pour démarrer le serveur avec `nodemon` (pour le rechargement automatique).
    ```bash
    npm run dev
    ```

4.  **Accéder à l'Application**
    Ouvrez votre navigateur et naviguez vers :
    [http://localhost:3000](http://localhost:3000)