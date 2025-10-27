// 1. Importer les dépendances
const express = require('express');
const path = require('path');
const Datastore = require('nedb'); // C'est notre base de données locale

// 2. Initialiser l'application Express
const app = express();
const PORT = 3000; // Le port sur lequel le serveur va écouter

// 3. Configuration de NeDB (Base de données)
// Nous créons un nouveau Datastore qui va stocker les données dans 'ideas.db'
const db = new Datastore({ filename: 'ideas.db', autoload: true });
console.log('Base de données NeDB chargée depuis ideas.db');

// 4. Configuration des Middlewares Express
// Permet à Express de lire le JSON et les données de formulaire
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Permet de servir les fichiers statiques (CSS, JS côté client)
// Le dossier 'public' contiendra le CSS et le JS du frontend
app.use(express.static(path.join(__dirname, 'public')));

// 5. Configuration d'EJS (Moteur de Templates)
// Indique à Express que nous allons utiliser EJS pour les vues
app.set('view engine', 'ejs'); 
// Indique où trouver les vues (par défaut dans le dossier 'views')
app.set('views', path.join(__dirname, 'views'));

// 6. Définir la première route (Page d'accueil)
app.get('/', (req, res) => {
    // Pour l'instant, on affiche juste "Bienvenue"
    // Plus tard, on récupèrera les données ici
    res.render('index', { 
        pageTitle: 'YT-Ideas-Hub' 
    }); 
});

// 7. Lancer le Serveur
app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});