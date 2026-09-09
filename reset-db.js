require("dotenv").config();

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function resetDatabase() {
    const client = await pool.connect();

    try {
        console.log("🔄 Début de la remise à zéro...");

        // Charger les 154 cartes depuis maps.json
        const cheminMaps = path.join(__dirname, "data", "maps.json");
        const maps = JSON.parse(fs.readFileSync(cheminMaps, "utf8"));

        const ids = maps.map(carte => carte.id);

        console.log(`🃏 ${ids.length} cartes trouvées.`);

        // Mélanger la pioche
        for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ids[i], ids[j]] = [ids[j], ids[i]];
        }

        await client.query("BEGIN");

        // Supprimer les anciennes données de test
        await client.query("DELETE FROM historique");
        await client.query("DELETE FROM joueurs");

        // Réinitialiser l'état du jeu
        await client.query(`
            DELETE FROM etat
            WHERE id = 1
        `);

        // Créer le défi n°1
        const carteId = ids.pop();

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
            VALUES (
                1,
                $1,
                $2,
                1,
                0,
                0,
                '{}',
                '{}',
                $3
            )
        `, [
            new Date().toISOString().split("T")[0],
            carteId,
            ids
        ]);

        await client.query("COMMIT");

        console.log("");
        console.log("🎉 RESET TERMINÉ !");
        console.log(`🎯 Nouveau défi : #1`);
        console.log(`🃏 Carte du défi : ${carteId}`);
        console.log(`📦 Cartes restantes dans la pioche : ${ids.length}`);
        console.log("");
        console.log("🌍 La base Neon est maintenant prête pour le lancement !");
        
    } catch (error) {
        await client.query("ROLLBACK");

        console.error("❌ Erreur pendant le reset :");
        console.error(error);

    } finally {
        client.release();
        await pool.end();
    }
}

resetDatabase();