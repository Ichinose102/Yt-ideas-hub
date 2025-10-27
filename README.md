# YT Ideas Hub 💡 - Gestion et Brainstorming d'Idées Vidéo

## Vue d'ensemble

**YT Ideas Hub** est une application web auto-hébergeable conçue pour les créateurs de contenu YouTube qui cherchent à centraliser, organiser et analyser leurs idées de vidéos.

Fini les listes dispersées ! Ce tableau de bord unique vous permet de gérer tout le cycle de vie de vos concepts, du simple **brouillon** à la **vidéo publiée**.

## Fonctionnalités Clés

* **Gestion du Cycle de Vie (CRUD):** Créez, lisez, modifiez et supprimez vos idées avec des statuts clairs (`Draft`, `In Progress`, `Published`).
* **Filtrage et Recherche Rapide:** Trouvez instantanément des idées par titre, description ou statut grâce à un système de filtrage performant.
* **Brainstorming assisté par IA (future feature):** Utilisation d'une API d'IA pour générer de nouvelles idées de contenu basées sur vos sujets favoris.
* **Suivi des Performances:** Liez vos idées au `youtubeVideoId` correspondant pour un suivi analytique futur (vues, rétention, etc.) directement dans l'application.
* **Interface Moderne:** Design épuré et professionnel avec support du **Mode Nuit/Jour** pour un confort visuel optimal.

## Technologies Utilisées

* **Backend:** Node.js
* **Framework:** Express.js
* **Base de données:** NeDB (simple et rapide pour les projets personnels)
* **Templating:** EJS (Embedded JavaScript)
* **Frontend:** HTML/CSS/JavaScript

## Installation (Local)

1.  **Cloner le dépôt:**
    ```bash
    git clone [https://github.com/votre_nom_utilisateur/yt-ideas-hub.git](https://github.com/votre_nom_utilisateur/yt-ideas-hub.git)
    cd yt-ideas-hub
    ```
2.  **Installer les dépendances:**
    ```bash
    npm install
    ```
3.  **Configurer les variables d'environnement:**
    * Créez un fichier `.env` à la racine.
    * Ajoutez vos clés API (pour l'IA et/ou YouTube Data API) et vos variables de session/port.
4.  **Lancer l'application:**
    ```bash
    npm run dev
    ```
    L'application sera accessible sur `http://localhost:3000` (ou le port défini).