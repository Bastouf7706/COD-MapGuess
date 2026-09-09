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
            reussites
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
        pioche: etatDB.pioche || [],
        historique: historiqueResult.rows.map(defi => ({
    numero: defi.numero,
    carteId: defi.carte_id,
    joueurs: defi.joueurs,
    reussites: defi.reussites
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
            pioche = $8
        WHERE id = 1
    `, [
        etat.date,
        etat.carteId,
        etat.numeroDefi,
        etat.joueurs,
        etat.reussites,
        etat.joueursVus,
        etat.joueursAyantTrouve,
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
            reussites
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (numero) DO UPDATE SET
            carte_id = EXCLUDED.carte_id,
            joueurs = EXCLUDED.joueurs,
            reussites = EXCLUDED.reussites
    `, [
        defi.numero,
        defi.carteId,
        defi.joueurs,
        defi.reussites
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

function calculerPourcentage(joueurs, reussites) {

    if (joueurs === 0) {
        return 0;
    }

    return (reussites / joueurs) * 100;

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

async function initialiserCarteDuJour() {

    const etatDB = await obtenirEtatDepuisDB();

    if (!etatDB) {
        throw new Error("❌ Impossible de récupérer l'état du jeu depuis PostgreSQL.");
    }

    etat = etatDB;

    const aujourdHui = obtenirDateDuDefi();

    // Première initialisation
    if (etat.date === null || etat.date === "") {

        if (etat.pioche.length === 0) {
            await creerNouvellePioche();
        }

        etat.carteId = etat.pioche.pop();

        etat.numeroDefi++;

        etat.joueurs = 0;
        etat.reussites = 0;

        etat.joueursVus = [];
        etat.joueursAyantTrouve = [];

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

                reussites: etat.reussites

            };

        etat.historique.push(defiTermine);

        await sauvegarderHistorique(defiTermine);

    }

            // Nouvelle pioche si nécessaire
            if (etat.pioche.length === 0) {

                await creerNouvellePioche();

            }

            // Nouveau défi
            etat.carteId = etat.pioche.pop();

            etat.numeroDefi++;

            etat.joueurs = 0;
            etat.reussites = 0;

            etat.joueursVus = [];
            etat.joueursAyantTrouve = [];

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
    await synchroniserStreaks();

    carteActuelle = maps.find(
        map => map.id === etat.carteId
    );

}

console.log(`${maps.length} cartes chargées.`);

// Sert tous les fichiers du projet
app.use(express.static(__dirname));
app.use(express.json()); // Recoit la réponse du joueur

// Page d'accueil
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Retourne la carte du défi quotidien
app.get("/api/map", async (req, res) => {

    console.log("1 - Début /api/map");
    await initialiserCarteDuJour();
    console.log("2 - Carte initialisée");

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

        carte: carteActuelle,

        defi: {

            numero: etat.numeroDefi,

            prochainReset: prochainReset.getTime()

        },

        precedent: cartePrecedente
            ? {

                numero: dernierDefi.numero,

                nom: cartePrecedente.nom,

                pourcentage: calculerPourcentage(
                    dernierDefi.joueurs,
                    dernierDefi.reussites
                )

            }
            : null

    });
    console.log("5 - Après res.json");

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
        !utiliseTousLesIndices &&
        !etat.joueursAyantTrouve.includes(playerId)
    ) {

        etat.joueursAyantTrouve.push(playerId);
        etat.reussites++;

    }
    await sauvegarderEtat();

    const pourcentage = etat.joueurs === 0
        ? 0
        : (etat.reussites / etat.joueurs) * 100;
        
    res.json({

        correct: correcte,

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

async function ajouterScoreJoueur(playerId, points, numeroDefi) {

    const joueur = await obtenirJoueur(playerId);

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

    // Ajout du score
    joueur.scoreTotal += points;

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

    return joueur;
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
    const points = req.body.points;
    const numeroDefi = req.body.numeroDefi;

    try {

        const nouveauScore = await ajouterScoreJoueur(
            playerId,
            points,
            numeroDefi
        );

        console.log("REPONSE SCORE ENVOYEE :", nouveauScore);

        res.json({

            scoreTotal: nouveauScore.scoreTotal,

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

// Permet au site de connaître le nom des maps
app.get("/api/cartes", (req,res)=>{

    res.json(
        maps.map(map => ({
            nom: map.nom
        }))
    );

});

// Démarrage du serveur
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Serveur lancé sur le port ${PORT}`);
});