require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

pool.query("SELECT NOW()")
    .then(result => {
        console.log("✅ Connexion PostgreSQL réussie !");
        console.log("Heure de PostgreSQL :", result.rows[0].now);
    })
    .catch(error => {
        console.error("❌ Erreur PostgreSQL :", error.message);
    })
    .finally(() => {
        pool.end();
    });