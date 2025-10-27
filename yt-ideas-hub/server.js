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

// 6. Définir la route principale (Page d'accueil)
app.get('/', (req, res) => {
    // 1. On demande à la DB de trouver TOUTES les idées ({})
    // 2. On les trie par date de création (du plus récent au plus ancien)
    db.find({}).sort({ createdAt: -1 }).exec((err, ideas) => {
        // Gestion des erreurs
        if (err) {
            console.error("Erreur lors de la récupération des idées:", err);
            return res.status(500).send("Erreur du serveur lors de la récupération des idées.");
        }
        
        // C'est ici que l'erreur est corrigée ! 
        // On passe le tableau 'ideas' à EJS.
        res.render('index', { 
            pageTitle: 'YT-Ideas-Hub',
            ideas: ideas // <--- Maintenant, 'ideas' est défini pour index.ejs
        }); 
    });
});


// Route GET pour afficher le formulaire de modification
app.get('/edit/:id', (req, res) => {
    // 1. Récupérer l'ID de l'idée depuis l'URL (e.g., /edit/T48G7d...)
    const ideaId = req.params.id;

    // 2. Chercher l'idée dans la base de données (NeDB)
    db.findOne({ _id: ideaId }, (err, idea) => {
        if (err || !idea) {
            console.error("Erreur ou Idée non trouvée pour modification:", err);
            // En cas d'erreur ou si l'ID n'existe pas, on renvoie une page 404
            return res.status(404).send("Idée introuvable.");
        }
        
        // 3. Si l'idée est trouvée, on rend la vue 'edit.ejs'
        // et on lui passe l'objet 'idea'
        res.render('edit', { 
            pageTitle: 'Modifier l\'Idée',
            idea: idea 
        });
    });
});



// Route POST pour créer une nouvelle idée
app.post('/idea', (req, res) => {
    // Les données du formulaire sont dans req.body grâce à express.urlencoded()
    const { title, description, category } = req.body;
    
    // Si express.urlencoded() n'est pas défini au début du server.js, req.body sera vide !
    if (!title || !description) {
        // Cette ligne est souvent ignorée, mais elle est cruciale
        console.error("ERREUR: Le titre ou la description est manquant dans la requête POST."); 
        return res.status(400).send("Le titre et la description sont requis.");
    }

    // Préparation de l'objet à insérer
    const newIdea = {
        title: title,
        description: description,
        category: category || 'General', 
        status: 'Draft', 
        createdAt: new Date().getTime() 
    };

    // Insertion dans NeDB
    db.insert(newIdea, (err, createdDoc) => {
        if (err) {
            console.error("Erreur d'insertion dans la DB:", err);
            return res.status(500).send("Erreur du serveur lors de la sauvegarde de l'idée.");
        }
        
        // Redirection : Cela force le rechargement de la page avec la nouvelle idée
        res.redirect('/');
    });
});


// Route POST pour la suppression
app.post('/idea/delete/:id', (req, res) => {
    // Récupère l'ID depuis l'URL (req.params)
    const ideaId = req.params.id;

    // Suppression dans NeDB
    // On supprime un document ({ _id: ideaId })
    db.remove({ _id: ideaId }, { multi: false }, (err, numRemoved) => {
        if (err || numRemoved === 0) {
            console.error("Erreur de suppression:", err);
            return res.status(404).send("Idée non trouvée ou erreur serveur.");
        }
        
        console.log(`Idée supprimée: ${ideaId}`);
        // Redirection vers la page d'accueil
        res.redirect('/');
    });
});


// Route GET pour afficher le formulaire de modification
app.get('/edit/:id', (req, res) => {
    // 1. Récupérer l'ID de l'idée depuis l'URL (req.params)
    const ideaId = req.params.id;

    // 2. Chercher l'idée dans la base de données (NeDB)
    db.findOne({ _id: ideaId }, (err, idea) => {
        if (err || !idea) {
            console.error("Erreur ou Idée non trouvée pour modification:", err);
            return res.status(404).send("Idée introuvable.");
        }
        
        // 3. Si l'idée est trouvée, on rend la vue 'edit.ejs' et on lui passe l'objet 'idea'
        res.render('edit', { 
            pageTitle: 'Modifier l\'Idée',
            idea: idea // <-- La vue edit.ejs en a besoin pour pré-remplir le formulaire
        });
    });
});


// Route POST pour traiter la modification et enregistrer dans la DB
app.post('/edit/update/:id', (req, res) => {
    const ideaId = req.params.id; // L'ID de l'idée à modifier
    const { title, description, category, status } = req.body; // Les nouvelles données du formulaire
    
    // 1. Préparation de l'objet de mise à jour ($set)
    // Nous utilisons $set pour remplacer uniquement les champs listés
    const updatedIdea = {
        title: title,
        description: description,
        category: category,
        status: status,
        updatedAt: new Date().getTime() 
    };

    // 2. Mise à jour dans NeDB
    // db.update(requête de recherche, données de mise à jour, options, callback)
    db.update({ _id: ideaId }, { $set: updatedIdea }, {}, (err, numReplaced) => {
        if (err) {
            console.error("Erreur de mise à jour dans la DB:", err);
            return res.status(500).send("Erreur serveur lors de la mise à jour.");
        }
        
        if (numReplaced === 0) {
            return res.status(404).send("Idée à modifier non trouvée.");
        }

        // 3. Redirection vers la page d'accueil
        res.redirect('/');
    });
});

// Permet de servir les fichiers statiques (CSS, JS côté client)
app.use(express.static(path.join(__dirname, 'public')));


// 7. Lancer le Serveur
app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});