const express = require("express");
const path = require("path");
const fs = require("fs");

require("dotenv").config();
const { Pool } = require("pg");
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// Permet d'obtenir les données des joueurs dans la DataBase
async function obtenirJoueurDepuisDB(playerId) {
    const result = await pool.query(`
        SELECT
            id,
            score_total,
            defis_recompenses,
            streak,
            meilleur_streak,
            dernier_defi_joue
        FROM joueurs
        WHERE id = $1
    `, [playerId]);

    if (result.rows.length === 0) {
        return null;
    }

    const joueur = result.rows[0];

    return {
        id: joueur.id,
        scoreTotal: joueur.score_total,
        defisRecompenses: joueur.defis_recompenses || [],
        streak: joueur.streak,
        meilleurStreak: joueur.meilleur_streak,
        dernierDefiJoue: joueur.dernier_defi_joue
    };
}

// Permet d'obtenir l'état de la pioche ainsi que l'historique dans la DataBase
async function obtenirEtatDepuisDB() {

    const result = await pool.query(`
        SELECT
            id,
            date,
            carte_id,
            numero_defi,
            joueurs,
            reussites,
            joueurs_vus,
            joueurs_ayant_trouve,
            visiteurs_vus,
            tentatives_joueurs,
            cartes_jouees,
            pioche
        FROM etat
        WHERE id = 1
    `);

    if (result.rows.length === 0) {
        return null;
    }

    const etatDB = result.rows[0];
    const historiqueResult = await pool.query(`
        SELECT
            numero,
            carte_id,
            joueurs,
            reussites,
            visiteurs
        FROM historique
        ORDER BY numero ASC
    `);
    return {
        date: etatDB.date,
        carteId: etatDB.carte_id,
        numeroDefi: etatDB.numero_defi,
        joueurs: etatDB.joueurs,
        reussites: etatDB.reussites,
        joueursVus: etatDB.joueurs_vus || [],
        joueursAyantTrouve: etatDB.joueurs_ayant_trouve || [],
        visiteursVus: etatDB.visiteurs_vus || [],
        tentativesJoueurs: Array.isArray(etatDB.tentatives_joueurs)
            ? etatDB.tentatives_joueurs
            : typeof etatDB.tentatives_joueurs === "string"
                ? JSON.parse(etatDB.tentatives_joueurs)
                : [],
        cartesJouees: etatDB.cartes_jouees || [],
        pioche: etatDB.pioche || [],
        historique: historiqueResult.rows.map(defi => ({
            numero: defi.numero,
            carteId: defi.carte_id,
            joueurs: defi.joueurs,
            reussites: defi.reussites,
            visiteurs: defi.visiteurs
        })),
    };
}

const app = express();
const PORT = process.env.PORT || 3000;
const CONFIG = {

    HEURE_RESET_UTC: 0,
    MINUTE_RESET_UTC: 0,
    SECONDE_RESET_UTC: 0

};
let carteActuelle = null;

// Permet d'obtenir une nouvelle pioche de carte lorsque toutes les cartes de la pioche sont passées une fois
async function creerNouvellePioche() {

    etat.pioche = maps.map(map => map.id);
    etat.cartesJouees = [];

    for (let i = etat.pioche.length - 1; i > 0; i--) {

        const j = Math.floor(Math.random() * (i + 1));

        [etat.pioche[i], etat.pioche[j]] =
        [etat.pioche[j], etat.pioche[i]];

    }

    await sauvegarderEtat();

    console.log("Nouvelle pioche créée.");

}

// Lecture du fichier maps.json
const maps = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, "data", "maps.json"),
        "utf8"
    )
);

let etat = null;

async function sauvegarderEtat() {

    await pool.query(`
        UPDATE etat
        SET
            date = $1,
            carte_id = $2,
            numero_defi = $3,
            joueurs = $4,
            reussites = $5,
            joueurs_vus = $6,
            joueurs_ayant_trouve = $7,
            visiteurs_vus = $8,
            tentatives_joueurs = $9,
            cartes_jouees = $10,
            pioche = $11
        WHERE id = 1
    `, [
        etat.date,
        etat.carteId,
        etat.numeroDefi,
        etat.joueurs,
        etat.reussites,
        etat.joueursVus,
        etat.joueursAyantTrouve,
        etat.visiteursVus,
        JSON.stringify(etat.tentativesJoueurs),
        JSON.stringify(etat.cartesJouees),
        etat.pioche
    ]);

    console.log("💾 État sauvegardé dans PostgreSQL.");

}

async function sauvegarderHistorique(defi) {

    await pool.query(`
        INSERT INTO historique (
            numero,
            carte_id,
            joueurs,
            reussites,
            visiteurs
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (numero) DO UPDATE SET
            carte_id = EXCLUDED.carte_id,
            joueurs = EXCLUDED.joueurs,
            reussites = EXCLUDED.reussites,
            visiteurs = EXCLUDED.visiteurs
    `, [
        defi.numero,
        defi.carteId,
        defi.joueurs,
        defi.reussites,
        defi.visiteurs
    ]);

    console.log(`📜 Défi #${defi.numero} sauvegardé dans PostgreSQL.`);
}

async function synchroniserStreaks() {

    const result = await pool.query(`
        SELECT
            id,
            streak,
            dernier_defi_joue
        FROM joueurs
    `);

    for (const joueur of result.rows) {

        // Aucun défi joué : rien à faire
        if (
            joueur.dernier_defi_joue === null ||
            joueur.dernier_defi_joue === 0
        ) {
            continue;
        }

        // Le joueur a joué le défi précédent :
        // sa série est toujours valide.
        if (
            joueur.dernier_defi_joue === etat.numeroDefi - 1
        ) {
            continue;
        }

        // Le joueur a joué un défi plus ancien :
        // il a donc manqué au moins un défi.
        if (
            joueur.dernier_defi_joue < etat.numeroDefi - 1
        ) {

            await pool.query(`
                UPDATE joueurs
                SET streak = 0
                WHERE id = $1
            `, [
                joueur.id
            ]);

            console.log(
                `🔄 Streak réinitialisée pour le joueur ${joueur.id}`
            );
        }
    }

    console.log("✅ Synchronisation des streaks terminée.");
}

function calculerPourcentage(visiteurs, reussites) {
    if (visiteurs === 0) {
        return 0;
    }

    return (reussites / visiteurs) * 100;
}

function obtenirDateDuDefi() {

    const maintenant = new Date();

    const reset = new Date(Date.UTC(

        maintenant.getUTCFullYear(),
        maintenant.getUTCMonth(),
        maintenant.getUTCDate(),
        CONFIG.HEURE_RESET_UTC,
        CONFIG.MINUTE_RESET_UTC,
        CONFIG.SECONDE_RESET_UTC

    ));

    // Si on n'a pas encore atteint l'heure du reset,
    // le défi appartient encore à la veille.

    if (maintenant < reset) {

        reset.setUTCDate(reset.getUTCDate() - 1);

    }

    return reset.toISOString().split("T")[0];

}

async function integrerNouvellesCartesDansPioche() {

    const nouvellesCartes = maps.filter(map =>
        !etat.pioche.includes(map.id) &&
        !etat.cartesJouees.includes(map.id)
    );

    if (nouvellesCartes.length === 0) {
        return;
    }

    for (const carte of nouvellesCartes) {

        etat.pioche.push(carte.id);

    }

    // Mélange la pioche après l'ajout des nouvelles cartes
    for (let i = etat.pioche.length - 1; i > 0; i--) {

        const j = Math.floor(Math.random() * (i + 1));

        [etat.pioche[i], etat.pioche[j]] =
        [etat.pioche[j], etat.pioche[i]];

    }

    await sauvegarderEtat();

    console.log(
        `➕ ${nouvellesCartes.length} nouvelle(s) carte(s) ajoutée(s) à la pioche.`
    );
}

async function initialiserCarteDuJour() {

    const etatDB = await obtenirEtatDepuisDB();

    if (!etatDB) {
        throw new Error("❌ Impossible de récupérer l'état du jeu depuis PostgreSQL.");
    }

    etat = etatDB;

    const aujourdHui = obtenirDateDuDefi();

    // Migration des anciennes parties : si la carte actuelle n'est pas encore enregistrée comme jouée dans le cycle actuel, on l'ajoute.
    if (
        etat.carteId !== null &&
        !etat.cartesJouees.includes(etat.carteId)
    ) {

        etat.cartesJouees.push(etat.carteId);

        await sauvegarderEtat();

        console.log(
            "📝 Carte actuelle ajoutée à cartesJouees :",
            etat.carteId
        );
    }

    // Première initialisation
    if (etat.date === null || etat.date === "") {

        if (etat.pioche.length === 0) {
            await creerNouvellePioche();
        }

        etat.carteId = etat.pioche.pop();
        etat.cartesJouees.push(etat.carteId);
        etat.numeroDefi++;

        etat.joueurs = 0;
        etat.reussites = 0;

        etat.joueursVus = [];
        etat.joueursAyantTrouve = [];
        etat.visiteursVus = [];

        etat.date = aujourdHui;

        await sauvegarderEtat();

    }

    // Rattrapage des jours pendant lesquels le serveur était éteint
    else if (etat.date !== aujourdHui) {

        console.log("Rattrapage des défis manqués.");
        console.log("Dernière date :", etat.date);
        console.log("Date actuelle :", aujourdHui);

        let dateCourante = new Date(
            etat.date + "T00:00:00Z"
        );

        const dateCible = new Date(
            aujourdHui + "T00:00:00Z"
        );

        while (dateCourante < dateCible) {

            // Archive le défi actuel
            if (etat.carteId !== null) {

                const defiTermine = {
                    numero: etat.numeroDefi,
                    carteId: etat.carteId,
                    joueurs: etat.joueurs,
                    reussites: etat.reussites,
                    visiteurs: etat.visiteursVus.length
                };

                etat.historique.push(defiTermine);

                await sauvegarderHistorique(defiTermine);

            }

            // Si la pioche actuelle est vide, on commence un nouveau cycle.
            if (etat.pioche.length === 0) {

                await creerNouvellePioche();

            } else {

                // La pioche actuelle continue son cycle. Les nouvelles cartes sont ajoutées avant de choisir la prochaine carte.
                await integrerNouvellesCartesDansPioche();

            }

            // Nouveau défi
            etat.carteId = etat.pioche.pop();
            etat.cartesJouees.push(etat.carteId);
            etat.numeroDefi++;

            etat.joueurs = 0;
            etat.reussites = 0;

            etat.joueursVus = [];
            etat.joueursAyantTrouve = [];
            etat.visiteursVus = [];

            // Jour suivant
            dateCourante.setUTCDate(
                dateCourante.getUTCDate() + 1
            );

            etat.date =
                dateCourante.toISOString().split("T")[0];

            console.log(
                `Défi ${etat.numeroDefi} créé pour le ${etat.date}`
            );

        }

        await sauvegarderEtat();

    }

    // Même jour :
    // on ne recrée surtout pas une nouvelle pioche si elle est vide, car cela signifie que la carte actuelle est potentiellement la dernière carte du cycle.
    else {

        if (etat.pioche.length > 0) {

            await integrerNouvellesCartesDansPioche();

        }

    }

    await synchroniserStreaks();

    carteActuelle = maps.find(
        map => map.id === etat.carteId
    );

}

console.log(`${maps.length} cartes chargées.`);

// Sert tous les fichiers du projet
app.use(express.static(__dirname));
app.use(express.json()); // Recoit la réponse du joueur

function genererIndiceNom(nom, tentatives) {
    if (tentatives < 9) {
        return "????";
    }

    const lettresRevelees = tentatives - 8;
    let masque = "";

    for (let i = 0; i < nom.length; i++) {
        if (
            nom[i] === " " ||
            i < lettresRevelees
        ) {
            masque += nom[i];
        } else {
            masque += "?";
        }
    }

    return masque;
}

// Page d'accueil
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Retourne la carte du défi quotidien
app.get("/api/map", async (req, res) => {

    console.log("1 - Début /api/map");
    await initialiserCarteDuJour();
    console.log("2 - Carte initialisée");

    const playerId = req.query.playerId;

        if (
            playerId &&
            !etat.visiteursVus.includes(playerId)
        ) {
            etat.visiteursVus.push(playerId);
            await sauvegarderEtat();

            console.log("👀 Nouveau visiteur :", playerId);
        }

    const prochainReset = new Date();
    console.log("3 - Reset créé");

    prochainReset.setUTCHours(
        CONFIG.HEURE_RESET_UTC,
        CONFIG.MINUTE_RESET_UTC,
        CONFIG.SECONDE_RESET_UTC,
        0
    );

    prochainReset.setUTCDate(
        prochainReset.getUTCDate() + 1
    );


    const dernierDefi = etat.historique.length > 0
        ? etat.historique[etat.historique.length - 1]
        : null;


    const cartePrecedente = dernierDefi
        ? maps.find(map => map.id === dernierDefi.carteId)
        : null;

    console.log("4 - Avant res.json");
    res.json({

        carte: {
            jeu: carteActuelle.jeu,
            annee: carteActuelle.annee,
            codeJeu: carteActuelle.codeJeu,
            difficulte: carteActuelle.difficulte,

            ...(playerId && etat.joueursAyantTrouve.includes(playerId)
                ? { nom: carteActuelle.nom }
                : {})
        },
        defi: {
            numero: etat.numeroDefi,
            prochainReset: prochainReset.getTime()
        },
        precedent: cartePrecedente
            ? {
                numero: dernierDefi.numero,
                nom: cartePrecedente.nom,
                pourcentage: calculerPourcentage(
                    dernierDefi.visiteurs,
                    dernierDefi.reussites
                )
            }
            : null
    });
    console.log("5 - Après res.json");
});

// Envoie uniquement l'image de la carte du défi actuel
app.get("/api/image", async (req, res) => {

    await initialiserCarteDuJour();

    const cheminImage = path.join(
        __dirname,
        "images",
        carteActuelle.codeJeu,
        carteActuelle.image
    );

    res.sendFile(cheminImage);

});

// Vérifie la réponse du joueur
app.post("/api/verifier", async (req, res) => {
    await initialiserCarteDuJour();
    const carte = maps.find(
        map => map.id === etat.carteId
    );
    if (!carte) {
        return res.status(500).json({
            erreur: "Carte du jour introuvable."
        });
    }
    const playerId = req.body.playerId;

    if (!etat.tentativesJoueurs) {
        etat.tentativesJoueurs = [];
    }

    let tentativeJoueur = etat.tentativesJoueurs.find(
        joueur => joueur.playerId === playerId
    );

    if (!tentativeJoueur) {

        tentativeJoueur = {
            playerId: playerId,
            tentatives: 0,
            debut: new Date().toISOString()
        };

        etat.tentativesJoueurs.push(tentativeJoueur);
    }

    tentativeJoueur.tentatives++;

    const indiceNom = genererIndiceNom(
        carte.nom,
        tentativeJoueur.tentatives
    );

    const utiliseTousLesIndices = req.body.utiliseTousLesIndices;
    const reponse = req.body.reponse
        .trim()
        .toLowerCase();
    console.log("Carte actuelle :", carte.nom);
    const correcte = carte.reponses.some(rep =>
        rep.toLowerCase() === reponse
    );
    // Nouveau joueur du défi ?
    if (!etat.joueursVus.includes(playerId)) {
        etat.joueursVus.push(playerId);
        etat.joueurs++;
    }

    // Première réussite de ce joueur ?

    if (
        correcte &&
        !etat.joueursAyantTrouve.includes(playerId)
    ) {

        etat.joueursAyantTrouve.push(playerId);

        if (!utiliseTousLesIndices) {
            etat.reussites++;
        }

    }

    await sauvegarderEtat();
    const pourcentage = etat.joueurs === 0
        ? 0
        : (etat.reussites / etat.joueurs) * 100;       
    res.json({
        correct: correcte,
        indiceNom: indiceNom,
        nom: correcte ? carte.nom : null,
        statistiques: {
            joueurs: etat.joueurs,
            reussites: etat.reussites,
            pourcentage: pourcentage
        }
    });
});

async function obtenirJoueur(playerId) {
    let joueur = await obtenirJoueurDepuisDB(playerId);
    if (!joueur) {
        joueur = {
            id: playerId,
            scoreTotal: 0,
            defisRecompenses: [],
            streak: 0,
            meilleurStreak: 0,
            dernierDefiJoue: null
        };
        await pool.query(`
            INSERT INTO joueurs (
                id,
                score_total,
                defis_recompenses,
                streak,
                meilleur_streak,
                dernier_defi_joue
            )
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            joueur.id,
            joueur.scoreTotal,
            joueur.defisRecompenses,
            joueur.streak,
            joueur.meilleurStreak,
            joueur.dernierDefiJoue
        ]);
        console.log("👤 Nouveau joueur créé dans PostgreSQL :", playerId);
    }
    if (!joueur.defisRecompenses) {
        joueur.defisRecompenses = [];
        await pool.query(`
            UPDATE joueurs
            SET defis_recompenses = $1
            WHERE id = $2
        `, [
            joueur.defisRecompenses,
            joueur.id
        ]);
    }
    return joueur;
}

function calculerScoreServeur(difficulte, tentatives, tempsEcoule) {

    let score;
    let scoreMinimum;

    switch (difficulte) {

        case "Facile":
            score = 1000;
            scoreMinimum = 100;
        break;

        case "Normale":
            score = 2500;
            scoreMinimum = 250;
        break;

        case "Difficile":
            score = 5000;
            scoreMinimum = 500;
        break;

        default:
            throw new Error("Difficulté invalide.");
    }

    // Pénalité du temps
    score -= tempsEcoule * 10;

    // Division à partir de la 9e tentative
    if (tentatives >= 9) {
        score = Math.floor(score / 2);
    }

    // Toutes les tentatives sauf la dernière sont des mauvaises réponses
    score -= (tentatives - 1) * 50;

    // Respect du score minimum
    if (score < scoreMinimum) {
        score = scoreMinimum;
    }

    return score;
}

async function ajouterScoreJoueur(playerId, numeroDefi) {
    console.log("Défi reçu par le serveur :", numeroDefi);
    console.log("Défi actuel du serveur :", etat.numeroDefi);

    if (numeroDefi !== etat.numeroDefi) {
        throw new Error("Défi invalide.");
    }

    if (!etat.joueursAyantTrouve.includes(playerId)) {
        throw new Error("Carte non trouvée.");
    }

    const joueur = await obtenirJoueur(playerId);
    const tentativeJoueur = etat.tentativesJoueurs.find(
        joueur => joueur.playerId === playerId
    );

    if (!tentativeJoueur) {
        throw new Error("Tentatives du joueur introuvables.");
    }

    const tentatives = tentativeJoueur.tentatives;

    if (typeof tentatives !== "number" || tentatives < 1) {
        throw new Error("Nombre de tentatives invalide.");
    }

    const debut = new Date(tentativeJoueur.debut);

    if (isNaN(debut.getTime())) {
        throw new Error("Temps de départ invalide.");
    }

    const tempsEcoule = Math.max(
        0,
        Math.floor((Date.now() - debut.getTime()) / 1000)
    );

    console.log("Temps écoulé côté serveur :", tempsEcoule, "secondes");

    console.log("=== STREAK ===");
    console.log("Dernier défi joué :", joueur.dernierDefiJoue);
    console.log("Défi actuel :", numeroDefi);
    console.log("Streak actuelle :", joueur.streak);

    if (
        joueur.dernierDefiJoue !== null &&
        joueur.dernierDefiJoue !== 0 &&
        numeroDefi <= joueur.dernierDefiJoue
    ) {
        return joueur;
    }

    // Empêche de reprendre les points
    if (joueur.defisRecompenses.includes(numeroDefi)) {
        return joueur;
    }

    // Calcul du score côté serveur
    const pointsCalcules = calculerScoreServeur(
        carteActuelle.difficulte,
        tentatives,
        tempsEcoule
    );

    const scoreAvant = joueur.scoreTotal;
    joueur.scoreTotal += pointsCalcules;
    const pointsGagnes = joueur.scoreTotal - scoreAvant;
    joueur.defisRecompenses.push(numeroDefi);

    // Gestion de la streak
    if (joueur.dernierDefiJoue === numeroDefi - 1) {
        joueur.streak++;
    } 
    else {
        joueur.streak = 1;
    }

    joueur.dernierDefiJoue = numeroDefi;

    if (joueur.streak > joueur.meilleurStreak) {
        joueur.meilleurStreak = joueur.streak;
    }

    console.log("Nouvelle streak :", joueur.streak);

    // Sauvegarde dans PostgreSQL
    await pool.query(`
        UPDATE joueurs
        SET
            score_total = $1,
            defis_recompenses = $2,
            streak = $3,
            meilleur_streak = $4,
            dernier_defi_joue = $5
        WHERE id = $6
    `, [
        joueur.scoreTotal,
        joueur.defisRecompenses,
        joueur.streak,
        joueur.meilleurStreak,
        joueur.dernierDefiJoue,
        joueur.id
    ]);

    console.log("💾 Score sauvegardé dans PostgreSQL.");
    return {
        ...joueur,
        pointsGagnes
    };
}

app.get("/api/score/:playerId", async (req, res) => {
    try {
        const joueur = await obtenirJoueur(
            req.params.playerId
        );
        res.json({
            scoreTotal: joueur.scoreTotal,
            streak: joueur.streak,
            meilleurStreak: joueur.meilleurStreak,
            dernierDefiJoue: joueur.dernierDefiJoue
        });
    } catch (erreur) {
        console.error(
            "❌ Erreur lors de la récupération du score :",
            erreur
        );
        res.status(500).json({
            erreur: "Impossible de récupérer le score."
        });
    }
});

app.post("/api/ajouterScore", async (req, res) => {
    console.log("RECEPTION AJOUT SCORE :", req.body);
    const playerId = req.body.playerId;
    const numeroDefi = req.body.numeroDefi;
    try {
        const nouveauScore = await ajouterScoreJoueur(
            playerId,
            numeroDefi,
        );
        console.log("REPONSE SCORE ENVOYEE :", nouveauScore);
        res.json({
            scoreTotal: nouveauScore.scoreTotal,
            pointsGagnes: nouveauScore.pointsGagnes,
            streak: nouveauScore.streak,
            meilleurStreak: nouveauScore.meilleurStreak
        });
    } catch (erreur) {
        console.error(
            "❌ Erreur lors de l'ajout du score :",
            erreur
        );
        res.status(500).json({
            erreur: "Impossible d'ajouter le score."
        });
    }
});

app.get("/api/cartes", (req, res) => {

    const recherche = (req.query.recherche || "")
        .trim()
        .toLowerCase();

    if (recherche.length === 0) {
        return res.json([]);
    }

    const resultats = maps
        .filter(map =>
            map.nom.toLowerCase().startsWith(recherche)
        )
        .slice(0, 10)
        .map(map => ({
            nom: map.nom
        }));

    res.json(resultats);

});

// Démarrage du serveur
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Serveur lancé sur le port ${PORT}`);
});