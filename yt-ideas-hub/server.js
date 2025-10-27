// Doit être la première ligne pour charger les variables d'environnement (dotenv)
require('dotenv').config(); 

// --- IMPORTS ET CONFIGURATION DE BASE ---
const express = require('express');
const Datastore = require('nedb');
const path = require('path');
const axios = require('axios'); 
const session = require('express-session'); // NOUVEAU
const bcrypt = require('bcrypt'); // NOUVEAU

const app = express();
const port = 3000;

// Base de données NeDB
const db = new Datastore({ filename: 'ideas.db', autoload: true });

// NOUVEAU: Base de données pour les utilisateurs
const usersDb = new Datastore({ filename: 'users.db', autoload: true });

// Récupération de la clé API depuis .env
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;


// --- MIDDLEWARES EXPRESS ---
app.use(express.static(path.join(__dirname, 'Public'))); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

// NOUVEAU: Configuration de la session utilisateur
// Nous utilisons un secret simple ici. Dans une application de production, ce serait une longue chaîne aléatoire dans le .env
app.use(session({
    secret: 'votre_cle_secrete_ici_mais_dans_le_env_en_prod', 
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // Session valide pendant 24 heures
}));

// NOUVEAU: Middleware pour vérifier si un utilisateur est connecté
// Ce middleware est essentiel. Il vérifie si req.session.userId existe.
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        next(); // L'utilisateur est connecté, continuer vers la route demandée
    } else {
        // Rediriger vers la page de connexion s'il n'est pas connecté
        res.redirect('/login'); 
    }
}


// --- FONCTIONS D'APPEL API YOUTUBE (inchangées) ---

// Fonction 1: Trouver l'ID d'une chaîne à partir d'un nom (Search)
async function getChannelIdFromQuery(query) {
    if (!YOUTUBE_API_KEY) {
        console.error("Clé API YouTube manquante!");
        return null;
    }
    // ... (Code de la fonction inchangé) ...
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

// Fonction 2: Récupérer les 3 dernières vidéos d'une chaîne par son ID (Search)
async function getRecentVideos(channelId) {
    if (!YOUTUBE_API_KEY || !channelId) return [];

    // ... (Code de la fonction inchangé) ...
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

// Fonction 3: Récupérer les statistiques détaillées de la chaîne (Channels)
async function getChannelStatistics(channelId) {
    if (!YOUTUBE_API_KEY || !channelId) return {};

    // ... (Code de la fonction inchangé) ...
    try {
        const url = 'https://www.googleapis.com/youtube/v3/channels';
        const response = await axios.get(url, {
            params: {
                key: YOUTUBE_API_KEY,
                id: channelId,
                part: 'snippet,statistics'
            }
        });

        const item = response.data.items[0];

        if (item) {
            return {
                title: item.snippet.title,
                thumbnail: item.snippet.thumbnails.default.url,
                subscriberCount: item.statistics.subscriberCount,
                viewCount: item.statistics.viewCount,
                videoCount: item.statistics.videoCount
            };
        }
        return {};

    } catch (error) {
        console.error("Erreur lors de l'appel à l'API YouTube (Channel Stats):", error.message);
        return {};
    }
}


// ----------------------------------------------------
// NOUVELLES ROUTES D'AUTHENTIFICATION (Login, Logout, Register)
// ----------------------------------------------------

// ROUTE A: Afficher le formulaire de connexion
app.get('/login', (req, res) => {
    // Si l'utilisateur est déjà connecté, le rediriger vers la page d'accueil
    if (req.session.userId) {
        return res.redirect('/');
    }
    res.render('login', { pageTitle: 'Connexion', error: null });
});

// ROUTE B: Traiter la connexion (POST)
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    usersDb.findOne({ username: username }, async (err, user) => {
        if (err || !user) {
            return res.render('login', { pageTitle: 'Connexion', error: "Nom d'utilisateur ou mot de passe incorrect." });
        }

        // Vérification du mot de passe haché
        const passwordMatch = await bcrypt.compare(password, user.passwordHash);

        if (passwordMatch) {
            // Connexion réussie : enregistrer l'ID utilisateur dans la session
            req.session.userId = user._id; 
            res.redirect('/');
        } else {
            res.render('login', { pageTitle: 'Connexion', error: "Nom d'utilisateur ou mot de passe incorrect." });
        }
    });
});

// ROUTE C: Déconnexion
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).send("Erreur lors de la déconnexion.");
        }
        res.redirect('/login');
    });
});

// ROUTE D: Afficher le formulaire d'inscription
app.get('/register', (req, res) => {
    res.render('register', { pageTitle: 'Inscription', error: null });
});

// ROUTE E: Traiter l'inscription (POST)
app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    // 1. Vérifier si l'utilisateur existe déjà
    usersDb.findOne({ username: username }, async (err, existingUser) => {
        if (existingUser) {
            return res.render('register', { pageTitle: 'Inscription', error: "Ce nom d'utilisateur est déjà pris." });
        }
        
        // 2. Hacher le mot de passe (Salting et hashing)
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // 3. Créer le nouvel utilisateur
        const newUser = {
            username: username,
            passwordHash: passwordHash, // Stocker le hachage
            createdAt: new Date().getTime()
        };

        usersDb.insert(newUser, (err, createdDoc) => {
            if (err) {
                console.error("Erreur d'insertion utilisateur:", err);
                return res.status(500).send("Erreur serveur lors de l'inscription.");
            }
            // Inscription réussie, connecter l'utilisateur immédiatement
            req.session.userId = createdDoc._id;
            res.redirect('/');
        });
    });
});


// ----------------------------------------------------
// ROUTES PRINCIPALES (PROTÉGÉES PAR isAuthenticated)
// ----------------------------------------------------

// ROUTE 1: Lire (Read) - Page d'accueil (PROTÉGÉE)
// Ajout de isAuthenticated pour forcer la connexion
app.get('/', isAuthenticated, async (req, res) => { 
    // MODIFIÉ : Ne récupérer que les idées de l'utilisateur connecté
    db.find({ userId: req.session.userId }).sort({ createdAt: -1 }).exec(async (err, ideas) => { 
        if (err) {
            console.error("Erreur lors de la récupération des idées:", err);
            return res.status(500).send("Erreur du serveur lors de la récupération des idées.");
        }
        
        // Enrichissement des idées avec les vidéos
        const videosPromises = ideas.map(async idea => {
            if (idea.youtubeChannelId) {
                idea.recentVideos = await getRecentVideos(idea.youtubeChannelId);
            } else {
                idea.recentVideos = [];
            }
            return idea;
        });

        const ideasWithVideos = await Promise.all(videosPromises);

        // Passer l'username à la vue
        usersDb.findOne({ _id: req.session.userId }, (err, user) => {
            const username = user ? user.username : 'Utilisateur';
            res.render('index', { 
                pageTitle: 'YT-Ideas-Hub',
                ideas: ideasWithVideos,
                username: username // Passage du nom d'utilisateur
            }); 
        });
    });
});

// ROUTE 2: Créer (Create) - POST pour ajouter une idée (PROTÉGÉE)
app.post('/idea', isAuthenticated, async (req, res) => {
    const { title, description, category, channelName } = req.body;
    
    let channelId = null;

    if (channelName && category.toLowerCase().includes('youtube')) {
        channelId = await getChannelIdFromQuery(channelName);
    }

    const newIdea = {
        title: title,
        description: description,
        category: category || 'General', 
        status: 'Draft', 
        createdAt: new Date().getTime(),
        youtubeChannelId: channelId,
        userId: req.session.userId // NOUVEAU: Lier l'idée à l'utilisateur
    };

    db.insert(newIdea, (err, createdDoc) => {
        if (err) {
            console.error("Erreur d'insertion dans la DB:", err);
            return res.status(500).send("Erreur du serveur lors de la sauvegarde de l'idée.");
        }
        res.redirect('/');
    });
});

// ROUTE 3: Modifier (Update - GET) - Afficher le formulaire pré-rempli (PROTÉGÉE)
app.get('/edit/:id', isAuthenticated, (req, res) => {
    const ideaId = req.params.id;

    // MODIFIÉ : Vérifier que l'idée appartient à l'utilisateur
    db.findOne({ _id: ideaId, userId: req.session.userId }, (err, idea) => {
        if (err || !idea) {
            // Ne pas révéler si l'idée n'existe pas ou n'appartient pas à l'utilisateur
            return res.status(404).send("Idée introuvable ou vous n'avez pas la permission.");
        }
        
        res.render('edit', { 
            pageTitle: 'Modifier l\'Idée',
            idea: idea 
        });
    });
});

// ROUTE 4: Modifier (Update - POST) - Traiter la mise à jour (PROTÉGÉE)
app.post('/edit/update/:id', isAuthenticated, (req, res) => {
    const ideaId = req.params.id;
    const { title, description, category, status } = req.body;
    
    const updatedIdea = {
        title: title,
        description: description,
        category: category,
        status: status,
        updatedAt: new Date().getTime()
    };

    // MODIFIÉ : Vérifier que l'idée appartient à l'utilisateur avant de mettre à jour
    db.update({ _id: ideaId, userId: req.session.userId }, { $set: updatedIdea }, {}, (err, numReplaced) => {
        if (err || numReplaced === 0) {
            return res.status(404).send("Idée introuvable ou vous n'avez pas la permission.");
        }
        res.redirect('/');
    });
});

// ROUTE 5: Supprimer (Delete) (PROTÉGÉE)
app.post('/idea/delete/:id', isAuthenticated, (req, res) => {
    const ideaId = req.params.id;

    // MODIFIÉ : Vérifier que l'idée appartient à l'utilisateur avant de supprimer
    db.remove({ _id: ideaId, userId: req.session.userId }, { multi: false }, (err, numRemoved) => {
        if (err || numRemoved === 0) {
            return res.status(404).send("Idée non trouvée ou vous n'avez pas la permission.");
        }
        res.redirect('/');
    });
});

// ROUTE 6: Tableau de bord de la chaîne (Dashboard) (PROTÉGÉE)
app.get('/dashboard/:id', isAuthenticated, async (req, res) => {
    const ideaId = req.params.id;

    // MODIFIÉ : Vérifier l'ID de l'idée ET de l'utilisateur
    db.findOne({ _id: ideaId, userId: req.session.userId }, async (err, idea) => {
        if (err || !idea) {
            return res.status(404).send("Idée, chaîne ou permission introuvable.");
        }

        const channelId = idea.youtubeChannelId;
        
        if (!channelId) {
            return res.status(400).send("Cette idée n'a pas d'ID de chaîne YouTube enregistré.");
        }

        const [channelStats, recentVideos] = await Promise.all([
            getChannelStatistics(channelId),
            getRecentVideos(channelId)
        ]);
        
        res.render('dashboard', {
            pageTitle: `Tableau de bord de ${idea.title}`,
            idea: idea,
            channelId: channelId,
            channelStats: channelStats,
            recentVideos: recentVideos
        });
    });
});


// Démarrage du serveur
app.listen(port, () => {
    console.log(`Base de données idées chargée depuis ideas.db`);
    console.log(`Base de données utilisateurs chargée depuis users.db`);
    console.log(`Serveur démarré sur http://localhost:${port}`);
    console.log(`Attention : Vous devez vous inscrire/connecter via /register ou /login`);
});