// Doit être la première ligne pour charger les variables d'environnement (dotenv)
require('dotenv').config(); 

// --- IMPORTS ET CONFIGURATION DE BASE ---
const express = require('express');
const Datastore = require('nedb');
const path = require('path');
const axios = require('axios'); 
const { GoogleGenAI } = require('@google/genai'); // NOUVEAU: Import Gemini
const session = require('express-session'); 
const bcrypt = require('bcrypt'); 
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();
const port = 3000;

// Base de données NeDB
const db = new Datastore({ filename: 'ideas.db', autoload: true });
const usersDb = new Datastore({ filename: 'users.db', autoload: true });

// Récupération des Clés
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

// INITIALISATION DE GEMINI
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const model = "gemini-2.5-flash"; 


// --- MIDDLEWARES EXPRESS ---
app.use(express.static(path.join(__dirname, 'Public'))); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

// Configuration de la session utilisateur
app.use(session({
    secret: 'votre_cle_secrete_ici_mais_dans_le_env_en_prod', 
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// Initialisation de Passport
app.use(passport.initialize());
app.use(passport.session());

// Fonction utilitaire pour obtenir l'ID de l'utilisateur connecté
const getCurrentUserId = (req) => req.session.userId || (req.user ? req.user._id : null);

// Middleware pour vérifier si un utilisateur est connecté
function isAuthenticated(req, res, next) {
    if (req.session.userId || req.user) {
        next(); 
    } else {
        res.redirect('/login'); 
    }
}


// ----------------------------------------------------
// FONCTIONS D'APPEL API YOUTUBE & GEMINI
// ----------------------------------------------------

// Fonction 1: Trouver l'ID d'une chaîne
async function getChannelIdFromQuery(query) {
    if (!YOUTUBE_API_KEY) { return null; }
    try {
        const url = 'https://www.googleapis.com/youtube/v3/search';
        const response = await axios.get(url, {
            params: { key: YOUTUBE_API_KEY, q: query, part: 'snippet', type: 'channel', maxResults: 1 }
        });
        return response.data.items && response.data.items.length > 0 ? response.data.items[0].snippet.channelId : null;
    } catch (error) {
        console.error("Erreur API YouTube (Channel ID):", error.message);
        return null;
    }
}

// Fonction 2: Récupérer les 3 dernières vidéos
async function getRecentVideos(channelId) {
    if (!YOUTUBE_API_KEY || !channelId) return [];
    try {
        const url = 'https://www.googleapis.com/youtube/v3/search';
        const response = await axios.get(url, {
            params: { key: YOUTUBE_API_KEY, channelId: channelId, part: 'snippet', order: 'date', maxResults: 3, type: 'video' }
        });
        return response.data.items.map(item => ({
            title: item.snippet.title, videoId: item.id.videoId, thumbnail: item.snippet.thumbnails.medium.url
        }));
    } catch (error) {
        console.error("Erreur API YouTube (Recent Videos):", error.message);
        return [];
    }
}

// Fonction 3: Récupérer les statistiques détaillées de la chaîne
async function getChannelStatistics(channelId) {
    if (!YOUTUBE_API_KEY || !channelId) return {};
    try {
        const url = 'https://www.googleapis.com/youtube/v3/channels';
        const response = await axios.get(url, {
            params: { key: YOUTUBE_API_KEY, id: channelId, part: 'snippet,statistics' }
        });
        const item = response.data.items[0];
        if (item) {
            return {
                title: item.snippet.title, thumbnail: item.snippet.thumbnails.default.url,
                subscriberCount: item.statistics.subscriberCount, viewCount: item.statistics.viewCount,
                videoCount: item.statistics.videoCount
            };
        }
        return {};
    } catch (error) {
        console.error("Erreur API YouTube (Channel Stats):", error.message);
        return {};
    }
}

// Fonction 4: Récupérer les statistiques détaillées d'une VIDÉO spécifique
async function getVideoStatistics(videoId) {
    if (!YOUTUBE_API_KEY || !videoId) return {};
    
    try {
        const url = 'https://www.googleapis.com/youtube/v3/videos';
        const response = await axios.get(url, {
            params: {
                key: YOUTUBE_API_KEY,
                id: videoId, 
                part: 'snippet,statistics'
            }
        });

        const item = response.data.items[0];

        if (item) {
            return {
                title: item.snippet.title,
                publishedAt: item.snippet.publishedAt,
                viewCount: item.statistics.viewCount,
                likeCount: item.statistics.likeCount || 0,
                commentCount: item.statistics.commentCount || 0
            };
        }
        return {};

    } catch (error) {
        console.error(`Erreur lors de l'appel à l'API YouTube (Video Stats pour ${videoId}):`, error.message);
        return {}; 
    }
}

// Fonction 5: Générer des idées d'articles/vidéos avec Gemini (VERSION JSON)
async function generateIdeas(keywords, category) {
    if (!GEMINI_API_KEY) {
        return { error: "Clé API Gemini non configurée. Impossible de générer des idées." };
    }

    const prompt = `
        Je suis un créateur de contenu. Génère 5 idées de titres et de concepts très engageants 
        (vidéos YouTube ou articles de blog) basés sur ces mots-clés : "${keywords}". 
        
        La catégorie cible est : "${category}".
        
        Ne réponds qu'avec l'objet JSON contenant un tableau de 5 idées.
    `;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                // IMPORTANT: Nous demandons une réponse au format JSON
                responseMimeType: "application/json",
                responseSchema: {
                    type: "object",
                    properties: {
                        ideas: {
                            type: "array",
                            description: "Une liste de 5 idées de contenu.",
                            items: {
                                type: "object",
                                properties: {
                                    title: {
                                        type: "string",
                                        description: "Un titre accrocheur pour l'idée (max 10 mots)."
                                    },
                                    concept: {
                                        type: "string",
                                        description: "Un concept détaillé pour l'idée (max 50 mots)."
                                    }
                                },
                                required: ["title", "concept"]
                            }
                        }
                    },
                    required: ["ideas"]
                },
            },
        });
        
        // L'API renvoie le JSON sous forme de chaîne, nous devons le parser
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);

    } catch (error) {
        console.error("Erreur API Gemini:", error);
        // Retourner un objet d'erreur pour la vue
        return { error: "Désolé, une erreur est survenue lors de la communication avec l'IA. Vérifiez la console serveur pour les détails." };
    }
}


// ----------------------------------------------------
// CONFIGURATION DE PASSPORT.JS (OAuth)
// ----------------------------------------------------

passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/callback" 
},
async (accessToken, refreshToken, profile, done) => {
    const googleId = profile.id;
    const email = profile.emails[0].value;
    const displayName = profile.displayName;

    usersDb.findOne({ googleId: googleId }, (err, user) => {
        if (err) { return done(err); }

        if (user) {
            return done(null, user);
        } else {
            const newUser = {
                username: displayName,
                email: email,
                googleId: googleId,
                authMethod: 'google',
                createdAt: new Date().getTime()
            };
            usersDb.insert(newUser, (err, createdDoc) => {
                if (err) { return done(null, false, { message: 'Erreur lors de la création de l\'utilisateur.' }); }
                return done(null, createdDoc);
            });
        }
    });
}));

passport.serializeUser((user, done) => {
    done(null, user._id); 
});

passport.deserializeUser((id, done) => {
    usersDb.findOne({ _id: id }, (err, user) => {
        done(err, user);
    });
});


// ----------------------------------------------------
// ROUTES D'AUTHENTIFICATION 
// ----------------------------------------------------

// Routes OAuth Google
app.get('/auth/google',
    passport.authenticate('google', {
        scope: ['profile', 'email']
    })
);

app.get('/auth/google/callback', 
    passport.authenticate('google', { 
        failureRedirect: '/login'
    }),
    (req, res) => {
        res.redirect('/global-dashboard'); 
    }
);

// Afficher le formulaire de connexion
app.get('/login', (req, res) => {
    if (req.session.userId || req.user) { return res.redirect('/global-dashboard'); } 
    res.render('login', { pageTitle: 'Connexion', error: null });
});

// Traiter la connexion (Locale)
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    usersDb.findOne({ username: username, authMethod: { $ne: 'google' } }, async (err, user) => {
        if (err || !user) {
            return res.render('login', { pageTitle: 'Connexion', error: "Nom d'utilisateur ou mot de passe incorrect." });
        }
        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (passwordMatch) {
            req.session.userId = user._id; 
            res.redirect('/global-dashboard'); 
        } else {
            res.render('login', { pageTitle: 'Connexion', error: "Nom d'utilisateur ou mot de passe incorrect." });
        }
    });
});

// Déconnexion
app.get('/logout', (req, res, next) => {
    if (req.user && req.logout) {
        req.logout(function(err) {
            if (err) { return next(err); }
            req.session.destroy(() => res.redirect('/login'));
        });
    } else {
        req.session.destroy(() => res.redirect('/login'));
    }
});

// Formulaire d'inscription
app.get('/register', (req, res) => {
    res.render('register', { pageTitle: 'Inscription', error: null });
});

// Traiter l'inscription
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    usersDb.findOne({ username: username }, async (err, existingUser) => {
        if (existingUser) {
            return res.render('register', { pageTitle: 'Inscription', error: "Ce nom d'utilisateur est déjà pris." });
        }
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        const newUser = { username: username, passwordHash: passwordHash, authMethod: 'local', createdAt: new Date().getTime() };
        usersDb.insert(newUser, (err, createdDoc) => {
            if (err) { return res.status(500).send("Erreur serveur lors de l'inscription."); }
            req.session.userId = createdDoc._id;
            res.redirect('/global-dashboard'); 
        });
    });
});


// ----------------------------------------------------
// ROUTE : Tableau de Bord Global
// ----------------------------------------------------
app.get('/global-dashboard', isAuthenticated, async (req, res) => {
    const currentUserId = getCurrentUserId(req);

    db.find({ userId: currentUserId }).exec(async (err, ideas) => { 
        if (err) {
            console.error("Erreur lors de la récupération des idées pour le dashboard global:", err);
            return res.status(500).send("Erreur serveur.");
        }

        // 1. Extraction des IDs Uniques des chaînes
        const allChannelIds = ideas
            .map(idea => idea.youtubeChannelId)
            .filter(id => id); 
        const uniqueChannelIds = [...new Set(allChannelIds)];
        
        // 2. Récupération des statistiques des chaînes
        const channelStatsPromises = uniqueChannelIds.map(channelId => getChannelStatistics(channelId));
        const allChannelStats = await Promise.all(channelStatsPromises); 
        
        // 3. Comptage des statuts 
        const statusCounts = ideas.reduce((acc, idea) => {
            const status = idea.status || 'Draft';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {});
        
        // 4. Récupérer le nom d'utilisateur
        usersDb.findOne({ _id: currentUserId }, (err, user) => {
            const username = user ? user.username : 'Utilisateur';

            // 5. Rendu de la vue avec TOUTES les variables nécessaires
            res.render('global-dashboard', { 
                pageTitle: 'Tableau de Bord Global',
                username: username,
                statusCounts: statusCounts,
                totalIdeas: ideas.length,
                allChannelStats: allChannelStats, 
            });
        });
    });
});

// ----------------------------------------------------
// NOUVELLE ROUTE : Brainstorming IA - Formulaire (GET)
// ----------------------------------------------------
app.get('/brainstorm', isAuthenticated, (req, res) => {
    res.render('brainstorm', { 
        pageTitle: 'Brainstorming IA - Générateur d\'Idées',
        results: null, // Initialisation des résultats
        inputKeywords: '', 
        inputCategory: '' 
    });
});

// NOUVELLE ROUTE : Brainstorming IA - Soumission (POST)
app.post('/brainstorm', isAuthenticated, async (req, res) => {
    const { keywords, category } = req.body;
    
    if (!keywords || keywords.trim() === "") {
        return res.render('brainstorm', { 
            pageTitle: 'Brainstorming IA - Générateur d\'Idées',
            results: { error: "Veuillez entrer au moins un mot-clé pour commencer." }, 
            inputKeywords: keywords, 
            inputCategory: category
        });
    }

    const aiResults = await generateIdeas(keywords, category || 'Général'); 

    res.render('brainstorm', { 
        pageTitle: 'Brainstorming IA - Générateur d\'Idées',
        results: aiResults,
        inputKeywords: keywords, 
        inputCategory: category
    });
});


// ----------------------------------------------------
// ROUTES PRINCIPALES
// ----------------------------------------------------

// ROUTE 1: Lire (Read) - Liste des idées 
app.get('/', isAuthenticated, async (req, res) => { 
    const currentUserId = getCurrentUserId(req);
    const { search, status } = req.query; 

    const query = { userId: currentUserId };

    if (status) {
        query.status = status; 
    }

    if (search) {
        const regex = new RegExp(search, 'i'); 
        query.$or = [
            { title: regex },
            { description: regex }
        ];
    }
    
    db.find(query).sort({ createdAt: -1 }).exec(async (err, ideas) => { 
        if (err) { return res.status(500).send("Erreur du serveur lors du filtrage."); }
        
        const videosPromises = ideas.map(async idea => {
            if (idea.youtubeChannelId) {
                idea.recentVideos = await getRecentVideos(idea.youtubeChannelId);
            } else {
                idea.recentVideos = [];
            }
            return idea;
        });

        const ideasWithVideos = await Promise.all(videosPromises);

        usersDb.findOne({ _id: currentUserId }, (err, user) => {
            const username = user ? user.username : 'Utilisateur';
            res.render('index', { 
                pageTitle: 'Liste des Idées', 
                ideas: ideasWithVideos, 
                username: username,
                query: req.query 
            }); 
        });
    });
});

// ROUTE 2: Créer (Create) - POST pour ajouter une idée (manuelle)
app.post('/idea', isAuthenticated, async (req, res) => {
    const { title, description, category, channelName } = req.body;
    const currentUserId = getCurrentUserId(req);
    
    let channelId = null;
    if (channelName && category.toLowerCase().includes('youtube')) {
        channelId = await getChannelIdFromQuery(channelName);
    }

    const newIdea = {
        title: title, description: description, category: category || 'General', 
        status: 'Draft', createdAt: new Date().getTime(),
        youtubeChannelId: channelId,
        userId: currentUserId 
    };

    db.insert(newIdea, (err, createdDoc) => {
        if (err) { return res.status(500).send("Erreur du serveur lors de la sauvegarde de l'idée."); }
        res.redirect('/');
    });
});

// ROUTE 2.5: Créer (Create) - POST pour ajouter une idée générée par l'IA
app.post('/idea/add-from-ia', isAuthenticated, async (req, res) => {
    const { title, description, category, isAIGenerated } = req.body;
    const currentUserId = getCurrentUserId(req);
    
    const newIdea = {
        title: title, 
        description: description, 
        category: category || 'General', 
        status: 'Draft', 
        createdAt: new Date().getTime(),
        isAIGenerated: isAIGenerated === 'true', 
        userId: currentUserId 
    };

    db.insert(newIdea, (err, createdDoc) => {
        if (err) { return res.status(500).send("Erreur du serveur lors de la sauvegarde de l'idée IA."); }
        res.redirect('/'); 
    });
});

// ROUTE 3: Modifier (Update - GET)
app.get('/edit/:id', isAuthenticated, (req, res) => {
    const ideaId = req.params.id;
    const currentUserId = getCurrentUserId(req);

    db.findOne({ _id: ideaId, userId: currentUserId }, (err, idea) => {
        if (err || !idea) {
            return res.status(404).send("Idée introuvable ou vous n'avez pas la permission.");
        }
        res.render('edit', { pageTitle: 'Modifier l\'Idée', idea: idea });
    });
});

// ROUTE 4: Modifier (Update - POST)
app.post('/edit/update/:id', isAuthenticated, (req, res) => {
    const ideaId = req.params.id;
    const { title, description, category, status, youtubeVideoId } = req.body; 
    const currentUserId = getCurrentUserId(req);
    
    const updatedIdea = {
        title: title,
        description: description,
        category: category,
        status: status,
        updatedAt: new Date().getTime(),
        youtubeVideoId: youtubeVideoId || null
    };

    db.update({ _id: ideaId, userId: currentUserId }, { $set: updatedIdea }, {}, (err, numReplaced) => {
        if (err || numReplaced === 0) {
            return res.status(404).send("Idée introuvable ou vous n'avez pas la permission.");
        }
        res.redirect('/');
    });
});

// ROUTE 5: Supprimer (Delete)
app.post('/idea/delete/:id', isAuthenticated, (req, res) => {
    const ideaId = req.params.id;
    const currentUserId = getCurrentUserId(req);

    db.remove({ _id: ideaId, userId: currentUserId }, { multi: false }, (err, numRemoved) => {
        if (err || numRemoved === 0) {
            return res.status(404).send("Idée non trouvée ou vous n'avez pas la permission.");
        }
        res.redirect('/');
    });
});

// ROUTE 6: Tableau de bord de la chaîne (Dashboard)
app.get('/dashboard/:id', isAuthenticated, async (req, res) => {
    const ideaId = req.params.id;
    const currentUserId = getCurrentUserId(req);

    db.findOne({ _id: ideaId, userId: currentUserId }, async (err, idea) => {
        if (err || !idea) {
            return res.status(404).send("Idée, chaîne ou permission introuvable.");
        }

        const channelId = idea.youtubeChannelId;
        
        if (!channelId) {
            return res.status(400).send("Cette idée n'a pas d'ID de chaîne YouTube enregistré.");
        }

        const promises = [
            getChannelStatistics(channelId),
            getRecentVideos(channelId)
        ];

        let videoStats = {};
        if (idea.youtubeVideoId) {
            promises.push(getVideoStatistics(idea.youtubeVideoId));
        }

        const results = await Promise.all(promises);
        const channelStats = results[0];
        const recentVideos = results[1];
        
        if (idea.youtubeVideoId) {
             videoStats = results[2]; 
        }

        res.render('dashboard', {
            pageTitle: `Tableau de bord de ${idea.title}`,
            idea: idea,
            channelId: channelId,
            channelStats: channelStats,
            recentVideos: recentVideos,
            videoStats: videoStats
        });
    });
});


// Démarrage du serveur
app.listen(port, () => {
    console.log(`Base de données idées chargée depuis ideas.db`);
    console.log(`Base de données utilisateurs chargée depuis users.db`);
    console.log(`Serveur démarré sur http://localhost:${port}`);
});