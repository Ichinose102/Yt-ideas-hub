// Doit être la première ligne pour charger les variables d'environnement (dotenv)
require('dotenv').config(); 

// --- IMPORTS ET CONFIGURATION DE BASE ---
const express = require('express');
const Datastore = require('nedb');
const path = require('path');
const axios = require('axios'); 

const app = express();
const port = 3000;

// Base de données NeDB
const db = new Datastore({ filename: 'ideas.db', autoload: true });

// Récupération de la clé API depuis .env
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;


// --- FONCTIONS D'APPEL API YOUTUBE ---

// Fonction 1: Trouver l'ID d'une chaîne à partir d'un nom
async function getChannelIdFromQuery(query) {
    if (!YOUTUBE_API_KEY) {
        console.error("Clé API YouTube manquante!");
        return null;
    }

    try {
        const url = 'https://www.googleapis.com/youtube/v3/search';
        const response = await axios.get(url, {
            params: {
                key: YOUTUBE_API_KEY,
                q: query,
                part: 'snippet',
                type: 'channel',
                maxResults: 1
            }
        });

        if (response.data.items && response.data.items.length > 0) {
            return response.data.items[0].snippet.channelId;
        } else {
            console.log(`Aucun ID de chaîne trouvé pour la requête : ${query}`);
            return null;
        }
    } catch (error) {
        console.error("Erreur lors de l'appel à l'API YouTube (Channel ID):", error.message);
        return null;
    }
}

// Fonction 2: Récupérer les 3 dernières vidéos d'une chaîne par son ID
async function getRecentVideos(channelId) {
    if (!YOUTUBE_API_KEY || !channelId) return [];

    try {
        const url = 'https://www.googleapis.com/youtube/v3/search';
        const response = await axios.get(url, {
            params: {
                key: YOUTUBE_API_KEY,
                channelId: channelId,
                part: 'snippet',
                order: 'date',
                maxResults: 3,
                type: 'video'
            }
        });

        return response.data.items.map(item => ({
            title: item.snippet.title,
            videoId: item.id.videoId,
            thumbnail: item.snippet.thumbnails.medium.url
        }));

    } catch (error) {
        console.error("Erreur lors de l'appel à l'API YouTube (Recent Videos):", error.message);
        return [];
    }
}


// --- MIDDLEWARES EXPRESS ---
app.use(express.static(path.join(__dirname, 'Public'))); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');


// ----------------------------------------------------
// ROUTES (LOGIQUE CRUD + DASHBOARD)
// ----------------------------------------------------

// ROUTE 1: Lire (Read) - Page d'accueil (async)
app.get('/', async (req, res) => { 
    db.find({}).sort({ createdAt: -1 }).exec(async (err, ideas) => { 
        if (err) {
            console.error("Erreur lors de la récupération des idées:", err);
            return res.status(500).send("Erreur du serveur lors de la récupération des idées.");
        }
        
        // Enrichir chaque idée avec les vidéos récentes
        const videosPromises = ideas.map(async idea => {
            if (idea.youtubeChannelId) {
                idea.recentVideos = await getRecentVideos(idea.youtubeChannelId);
            } else {
                idea.recentVideos = [];
            }
            return idea;
        });

        const ideasWithVideos = await Promise.all(videosPromises);

        res.render('index', { 
            pageTitle: 'YT-Ideas-Hub',
            ideas: ideasWithVideos 
        }); 
    });
});

// ROUTE 2: Créer (Create) - POST pour ajouter une idée (async)
app.post('/idea', async (req, res) => {
    const { title, description, category, channelName } = req.body;
    
    let channelId = null;

    // Récupération de l'ID de chaîne via l'API
    if (channelName && category.toLowerCase().includes('youtube')) {
        channelId = await getChannelIdFromQuery(channelName);
    }

    const newIdea = {
        title: title,
        description: description,
        category: category || 'General', 
        status: 'Draft', 
        createdAt: new Date().getTime(),
        youtubeChannelId: channelId 
    };

    db.insert(newIdea, (err, createdDoc) => {
        if (err) {
            console.error("Erreur d'insertion dans la DB:", err);
            return res.status(500).send("Erreur du serveur lors de la sauvegarde de l'idée.");
        }
        res.redirect('/');
    });
});

// ROUTE 3: Modifier (Update - GET) - Afficher le formulaire pré-rempli
app.get('/edit/:id', (req, res) => {
    const ideaId = req.params.id;

    db.findOne({ _id: ideaId }, (err, idea) => {
        if (err || !idea) {
            console.error("Erreur ou Idée non trouvée pour modification:", err);
            return res.status(404).send("Idée introuvable.");
        }
        
        res.render('edit', { 
            pageTitle: 'Modifier l\'Idée',
            idea: idea 
        });
    });
});

// ROUTE 4: Modifier (Update - POST) - Traiter la mise à jour
app.post('/edit/update/:id', (req, res) => {
    const ideaId = req.params.id;
    const { title, description, category, status } = req.body;
    
    const updatedIdea = {
        title: title,
        description: description,
        category: category,
        status: status,
        updatedAt: new Date().getTime()
    };

    db.update({ _id: ideaId }, { $set: updatedIdea }, {}, (err, numReplaced) => {
        if (err || numReplaced === 0) {
            console.error("Erreur de mise à jour:", err);
            return res.status(500).send("Erreur serveur ou idée non trouvée.");
        }
        res.redirect('/');
    });
});

// ROUTE 5: Supprimer (Delete)
app.post('/idea/delete/:id', (req, res) => {
    const ideaId = req.params.id;

    db.remove({ _id: ideaId }, { multi: false }, (err, numRemoved) => {
        if (err || numRemoved === 0) {
            console.error("Erreur de suppression:", err);
            return res.status(404).send("Idée non trouvée ou erreur serveur.");
        }
        res.redirect('/');
    });
});

// ROUTE 6: Tableau de bord de la chaîne (Dashboard) - NOUVELLE ROUTE
app.get('/dashboard/:id', async (req, res) => {
    const ideaId = req.params.id;

    db.findOne({ _id: ideaId }, async (err, idea) => {
        if (err || !idea) {
            return res.status(404).send("Idée ou chaîne introuvable.");
        }

        const channelId = idea.youtubeChannelId;
        
        if (!channelId) {
            return res.status(400).send("Cette idée n'a pas d'ID de chaîne YouTube enregistré.");
        }

        // Tâche future : Nous allons ajouter ici la logique pour obtenir les statistiques détaillées (abonnés, vues).
        let channelStats = {}; 
        
        res.render('dashboard', {
            pageTitle: `Tableau de bord de ${idea.title}`,
            idea: idea,
            channelId: channelId,
            channelStats: channelStats 
        });
    });
});


// Démarrage du serveur
app.listen(port, () => {
    console.log(`Base de données NeDB chargée depuis ideas.db`);
    console.log(`Serveur démarré sur http://localhost:${port}`);
});