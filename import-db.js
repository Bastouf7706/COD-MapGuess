require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

const cheminEtat = path.join(__dirname, "data", "etat.json");
const cheminJoueurs = path.join(__dirname, "data", "joueurs.json");

const etat = JSON.parse(fs.readFileSync(cheminEtat, "utf8"));
const joueurs = JSON.parse(fs.readFileSync(cheminJoueurs, "utf8"));

async function importer() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        console.log("📦 Import de l'état du jeu...");

        await client.query(`
            INSERT INTO etat (
                id,
                date,
                carte_id,
                numero_defi,
                joueurs,
                reussites,
                joueurs_vus,
                joueurs_ayant_trouve,
                pioche
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT (id) DO UPDATE SET
                date = EXCLUDED.date,
                carte_id = EXCLUDED.carte_id,
                numero_defi = EXCLUDED.numero_defi,
                joueurs = EXCLUDED.joueurs,
                reussites = EXCLUDED.reussites,
                joueurs_vus = EXCLUDED.joueurs_vus,
                joueurs_ayant_trouve = EXCLUDED.joueurs_ayant_trouve,
                pioche = EXCLUDED.pioche
        `, [
            1,
            etat.date,
            etat.carteId,
            etat.numeroDefi,
            etat.joueurs,
            etat.reussites,
            etat.joueursVus,
            etat.joueursAyantTrouve,
            etat.pioche
        ]);

        console.log("✅ État actuel importé.");

        console.log("📜 Import de l'historique...");

        for (const defi of etat.historique) {
            await client.query(`
                INSERT INTO historique (
                    numero,
                    carte_id,
                    joueurs,
                    reussites
                )
                VALUES ($1,$2,$3,$4)
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
        }

        console.log(`✅ ${etat.historique.length} défis historiques importés.`);

        console.log("👤 Import des joueurs...");

        for (const joueur of joueurs) {
            await client.query(`
                INSERT INTO joueurs (
                    id,
                    score_total,
                    defis_recompenses,
                    streak,
                    meilleur_streak,
                    dernier_defi_joue
                )
                VALUES ($1,$2,$3,$4,$5,$6)
                ON CONFLICT (id) DO UPDATE SET
                    score_total = EXCLUDED.score_total,
                    defis_recompenses = EXCLUDED.defis_recompenses,
                    streak = EXCLUDED.streak,
                    meilleur_streak = EXCLUDED.meilleur_streak,
                    dernier_defi_joue = EXCLUDED.dernier_defi_joue
            `, [
                joueur.id,
                joueur.scoreTotal,
                joueur.defisRecompenses || [],
                joueur.streak,
                joueur.meilleurStreak,
                joueur.dernierDefiJoue
            ]);
        }

        console.log(`✅ ${joueurs.length} joueur(s) importé(s).`);

        await client.query("COMMIT");

        console.log("");
        console.log("🎉 IMPORT TERMINÉ AVEC SUCCÈS !");
        console.log(`Défi actuel : #${etat.numeroDefi}`);
        console.log(`Carte actuelle : ${etat.carteId}`);
        console.log(`Cartes restantes dans la pioche : ${etat.pioche.length}`);

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("❌ Erreur pendant l'import :", error);
    } finally {
        client.release();
        await pool.end();
    }
}

importer();