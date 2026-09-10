const image = document.getElementById("mapImage");
const input = document.getElementById("reponse");
const resultat = document.getElementById("resultat");
const listeEssais = document.getElementById("listeEssais");
const texteTentatives = document.getElementById("tentatives");
const chrono = document.getElementById("chrono");
const difficulte = document.getElementById("difficulte");
const compteRebours = document.getElementById("compteRebours");
const numeroDefi = document.getElementById("numeroDefi");
const defiPrecedent = document.getElementById("defiPrecedent");
const popup = document.getElementById("fenetreVictoire");
const popupNumero = document.getElementById("popupNumeroDefi");
const popupCarte = document.getElementById("popupCarte");
const popupJeu = document.getElementById("popupJeu");
const popupDifficulte = document.getElementById("popupDifficulte");
const popupTemps = document.getElementById("popupTemps");
const popupTentatives = document.getElementById("popupTentatives");
const fermerPopup = document.getElementById("fermerPopup");
const popupPourcentage = document.getElementById("popupPourcentage");
const popupJoueurs = document.getElementById("popupJoueurs");
const scoreTexte = document.getElementById("scoreValeur");
const scoreTotalTexte = document.getElementById("scoreTotalValeur");
const streakTexte = document.getElementById("streak");
const indiceJeu = document.getElementById("indiceJeu");
const indiceDate = document.getElementById("indiceDate");
const indiceNom = document.getElementById("indiceNom");
const inputReponse = document.getElementById("reponse");
const suggestions = document.getElementById("suggestions");

let temps = 0;
let intervalChrono = null;
let intervalCompteRebours = null;
let chronoDemarre = false;
let partieTerminee = false;

let nombreTentatives = 0;

let essais = [];
let carteDuJour = null;
let defiDuJour = null;
let precedent = null;
let statistiquesServeur = null;
let score = 0;
let scoreTotal = 0;
let streak = 0;
let meilleurStreak = 0;
let scoreMinimum = 0;
let scoreDivise = false;
let aTrouveAvecIndices = false;
let listeCartes = [];
let traductions = {};
let langueActuelle = localStorage.getItem("langue") || "fr";

let playerId = localStorage.getItem("playerId");

if (!playerId) {

    playerId = crypto.randomUUID();

    localStorage.setItem("playerId", playerId);

}

async function chargerLangue(code) {

    const response = await fetch("/data/langues.json");

    traductions = await response.json();

    langueActuelle = code;

}

function appliquerLangue() {

    const langue = traductions[langueActuelle];

    if (!langue) {
        return;
    }

    document.documentElement.lang = langueActuelle;

    document.querySelectorAll("[data-i18n]").forEach(element => {

        const cle = element.dataset.i18n;

        if (langue[cle]) {

            element.textContent = langue[cle];

        }

    });

}

function actualiserTextesDynamiques() {

    if (!traductions[langueActuelle]) {
        return;
    }

    const langue = traductions[langueActuelle];


    // Série
    document.getElementById("streak").textContent =
    `🔥 ${langue.serie} : ${streak}`;


    // Record
    document.getElementById("meilleurStreak").textContent =
    `🏆 ${langue.record} : ${meilleurStreak}`;


    // Score total
    document.getElementById("scoreTotal").textContent =
    `👤 ${langue.scoreTotal} : ${scoreTotal}`;


    // Nouveau défi
    const texteNouveauDefi = document.querySelector(".prochain-defi p:first-child");

    if (texteNouveauDefi) {

        texteNouveauDefi.textContent =
        `🌍 ${langue.nouveauDefi}`;

    }


    // Défi mondial
    if (defiDuJour) {

        numeroDefi.textContent =
        `🌍 ${langue.defi} #${String(defiDuJour.numero).padStart(3,"0")}`;

    }


    // Dernier défi
    if (precedent) {

        defiPrecedent.textContent =
        `🏆 ${langue.dernierDefi} : #${String(precedent.numero).padStart(3,"0")} • ${precedent.nom} • ${precedent.pourcentage.toFixed(2)}%`;

    }


    // Temps
    if (chrono) {

        chrono.textContent =
        `${langue.temps} : ${convertirTemps(temps)}`;

    }


    // Tentatives
    afficherTentatives();


    // Indices
    afficherIndices();


    // Difficulté
    if (carteDuJour) {

        afficherDifficulte(
            difficulte,
            carteDuJour.difficulte
        );

    }

}

const choixLangue = document.getElementById("choixLangue");

choixLangue.value = langueActuelle;

choixLangue.addEventListener("change",()=>{

    langueActuelle = choixLangue.value;

    localStorage.setItem(
        "langue",
        langueActuelle
    );

    appliquerLangue();

    actualiserTextesDynamiques();

    if (popup.classList.contains("popup-visible")) {
    afficherPopupVictoire();
    }

});

async function chargerSuggestions() {

    const response = await fetch("/api/cartes");

    listeCartes = await response.json();

}

inputReponse.addEventListener("input", () => {

    const recherche = inputReponse.value.toLowerCase();

    suggestions.innerHTML = "";

    if (recherche.length === 0) {
        return;
    }


    const resultats = listeCartes.filter(map =>
        map.nom.toLowerCase().startsWith(recherche)
    );


    resultats.slice(0, 10).forEach(carte => {

        const div = document.createElement("div");

        div.classList.add("suggestion");

        div.textContent = carte.nom;


        div.addEventListener("click", () => {

            inputReponse.value = carte.nom;

            suggestions.innerHTML = "";

            inputReponse.focus();

        });


        suggestions.appendChild(div);

    });

});

async function chargerScoreTotal() {

    const response = await fetch(
        `/api/score/${playerId}`
    );

    const data = await response.json();

    console.log("Réponse /api/score :", data);

    scoreTotal = data.scoreTotal;
    streak = data.streak;
    meilleurStreak = data.meilleurStreak;

    scoreTotalValeur.textContent = scoreTotal;

    document.getElementById("streak").textContent =
        `🔥 ${traductions[langueActuelle].serie} : ${streak}`;

    document.getElementById("meilleurStreak").textContent =
        `🏆 ${traductions[langueActuelle].record} : ${meilleurStreak}`;

}

async function chargerCarte() {

    try {

        await chargerSuggestions();
        const response = await fetch(
            `/api/map?playerId=${encodeURIComponent(playerId)}`
        );
        const data = await response.json();

        carteDuJour = data.carte;
        switch (carteDuJour.difficulte) {

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

        }
        defiDuJour = data.defi;
        precedent = data.precedent;

        window.cleDefi = `defi-${defiDuJour.numero}`;
        await chargerScoreTotal();
        console.log("Clé :", window.cleDefi);

        const sauvegarde = JSON.parse(
            localStorage.getItem(window.cleDefi)
        );
        
        if (sauvegarde) {

            temps = sauvegarde.temps;
            nombreTentatives = sauvegarde.tentatives;

            essais = sauvegarde.essais || [];
            chronoDemarre = sauvegarde.chronoDemarre || false;
            scoreDivise = sauvegarde.scoreDivise || false;
            aTrouveAvecIndices = sauvegarde.aTrouveAvecIndices || false;
            score = sauvegarde.score ?? score;

            afficherEssais();
            afficherTentatives();

            chrono.textContent =
            `Temps : ${convertirTemps(temps)}`;
            if (!sauvegarde.gagne && sauvegarde.chronoDemarre) {

                chronoDemarre = false;
                demarrerChrono();

            }

            if (sauvegarde.pourcentage !== null) {

                statistiquesServeur = {

                    pourcentage: sauvegarde.pourcentage,
                    joueurs: sauvegarde.joueurs,
                    reussites: sauvegarde.reussites

                };

            }

            if (sauvegarde.gagne) {

                partieTerminee = true;

                input.disabled = true;

                afficherIndices();

                afficherPopupVictoire();

            }
        }

        numeroDefi.textContent =
        `🌍 DÉFI MONDIAL #${String(defiDuJour.numero).padStart(3, "0")}`;

        if (precedent) {

            defiPrecedent.textContent =
            `🏆 ${traductions[langueActuelle].dernierDefi} : #${String(precedent.numero).padStart(3, "0")} • ${precedent.nom} • ${precedent.pourcentage.toFixed(2)}%`;

        }

        image.src = `/images/${carteDuJour.codeJeu}/${carteDuJour.image}`;

        demarrerCompteRebours(defiDuJour.prochainReset);
        afficherDifficulte(
            difficulte,
            carteDuJour.difficulte
        );


        if (!sauvegarde) {

            reinitialiserInterface();

        }

        afficherDifficulte(difficulte, carteDuJour.difficulte);

    } catch (error) {

        console.error(error);

    }
}

function demarrerChrono() {

    if (chronoDemarre) {
        return;
    }

    chronoDemarre = true;

    intervalChrono = setInterval(() => {

        temps++;
        reduireScore(10);

        const minutes = Math.floor(temps / 60);
        const secondes = temps % 60;

        chrono.textContent =
        `${traductions[langueActuelle].temps} : ${String(minutes).padStart(2, "0")}:${String(secondes).padStart(2, "0")}`;

    },1000);

}

function arreterChrono() {

    clearInterval(intervalChrono);

}

function demarrerCompteRebours(prochainReset) {

    clearInterval(intervalCompteRebours);

    intervalCompteRebours = setInterval(() => {

        const maintenant = Date.now();

        let tempsRestant = prochainReset - maintenant;


        if (tempsRestant <= 0) {

            compteRebours.textContent =
                traductions[langueActuelle].nouveauDefi;

            return;

        }


        const heures = Math.floor(
            tempsRestant / (1000 * 60 * 60)
        );

        tempsRestant %= (1000 * 60 * 60);


        const minutes = Math.floor(
            tempsRestant / (1000 * 60)
        );

        tempsRestant %= (1000 * 60);


        const secondes = Math.floor(
            tempsRestant / 1000
        );


        compteRebours.textContent =
         `${String(heures).padStart(2, "0")} h `
         + `${String(minutes).padStart(2, "0")} min `
         + `${String(secondes).padStart(2, "0")} s`;


    }, 1000);

}

function reinitialiserInterface() {

    resultat.textContent = "";

    input.value = "";

    essais = [];

    afficherEssais();

    nombreTentatives = 0;

    afficherTentatives();

    temps = 0;

    chronoDemarre = false;

    clearInterval(intervalChrono);

    chrono.textContent = "Temps : 00:00";

    scoreDivise = false;

    switch (carteDuJour.difficulte) {

        case "Facile":
            score = 1000;
        break;

        case "Normale":
            score = 2500;
        break;

        case "Difficile":
            score = 5000;
        break;

    }

}

function sauvegarderPartie() {

    localStorage.setItem(

        window.cleDefi,

        JSON.stringify({

            gagne: partieTerminee,

            temps: temps,

            tentatives: nombreTentatives,

            essais: essais,

            chronoDemarre: chronoDemarre,

            scoreDivise: scoreDivise,

            score: score,

            aTrouveAvecIndices: aTrouveAvecIndices,

            pourcentage: statistiquesServeur
                ? statistiquesServeur.pourcentage
                : null,

            joueurs: statistiquesServeur
                ? statistiquesServeur.joueurs
                : null,

            reussites: statistiquesServeur
                ? statistiquesServeur.reussites
                : null

        })

    );

}

function afficherDifficulte(element, difficulteCarte) {

    const langue = traductions[langueActuelle];

    switch (difficulteCarte) {

        case "Facile":

            element.textContent =
            "🟢 " + langue.facile;

            element.style.color = "#4CAF50";

        break;


        case "Normale":

            element.textContent =
            "🟠 " + langue.normale;

            element.style.color = "#FF9800";

        break;


        case "Difficile":

            element.textContent =
            "🔴 " + langue.difficile;

            element.style.color = "#F44336";

        break;

    }

    afficherScore();

}

function afficherEssais() {

    listeEssais.innerHTML = "";

    for (const essai of essais) {

        const li = document.createElement("li");

        li.textContent =`${essai.correct ? "✅" : "❌"} ${essai.texte} ×${essai.compteur}`;

        if (essai.correct) {

            li.classList.add("essai-vrai");

        } else {

            li.classList.add("essai-faux");

        }

        listeEssais.appendChild(li);

    }

}

function afficherTentatives() {

    texteTentatives.textContent =
    `${traductions[langueActuelle].tentatives} : ${nombreTentatives}`;

}

function afficherScore() {

    scoreTexte.textContent = score;

}

function afficherIndices() {

    // Si la carte a été trouvée, afficher tous les indices
    if (partieTerminee) {

        indiceJeu.textContent =
            `🎮 ${traductions[langueActuelle].jeu} : ${carteDuJour.jeu}`;

        indiceDate.textContent =
            `📅 ${traductions[langueActuelle].sortie} : ${carteDuJour.annee}`;

        indiceNom.textContent =
            `🔤 ${traductions[langueActuelle].nom} : ${carteDuJour.nom}`;

        return;
    }


    // Indices cachés par défaut

    indiceJeu.textContent =
        `🎮 ${traductions[langueActuelle].jeu} : ???`;

    indiceDate.textContent =
        `📅 ${traductions[langueActuelle].sortie} : ???`;

    indiceNom.textContent =
        `🔤 ${traductions[langueActuelle].nom} : ????`;


    // Indice du jeu après 3 essais

    if (nombreTentatives >= 3) {

        indiceJeu.textContent =
            `🎮 ${traductions[langueActuelle].jeu} : ${carteDuJour.jeu}`;

    }


    // Indice de l'année après 6 essais

    if (nombreTentatives >= 6) {

        indiceDate.textContent =
            `📅 ${traductions[langueActuelle].sortie} : ${carteDuJour.annee}`;

    }


    // Première lettre après 9 essais

    if (nombreTentatives >= 9) {

        let nom = carteDuJour.nom;
        let masque = "";

        for (let i = 0; i < nom.length; i++) {

            if (i === 0 || nom[i] === " ") {
                masque += nom[i];
            } else {
                masque += "?";
            }

        }

        indiceNom.textContent =
            `🔤 ${traductions[langueActuelle].nom} : ${masque}`;

    }


    // Une lettre supplémentaire à chaque essai après 10

    if (nombreTentatives >= 10) {

        let nom = carteDuJour.nom;
        let lettresRevelees = nombreTentatives - 8;
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

        if (
            nombreTentatives >=
            10 + carteDuJour.nom.length - 1
        ) {
            aTrouveAvecIndices = true;
        }

        indiceNom.textContent =
            `🔤 ${traductions[langueActuelle].nom} : ${masque}`;

    }

}

function reduireScore(points) {

    score -= points;

    if (score < scoreMinimum) {

        score = scoreMinimum;

    }

    afficherScore();

    sauvegarderPartie();

}

async function verifierReponse() {

    if (partieTerminee) {
        return;
    }
    const reponse = input.value.trim();

    // Si le joueur n'a rien écrit, on ne fait rien
    if (reponse === "") {
        return;
    }

    // Nouvelle tentative
    nombreTentatives++;
    afficherIndices();
    afficherTentatives();
    demarrerChrono();

    if (nombreTentatives >= 9 && !scoreDivise) {

        score = Math.floor(score / 2);

        scoreDivise = true;

        afficherScore();

    } 

    input.value = "";
    input.focus();

    const response = await fetch("/api/verifier", {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            playerId: playerId,
            reponse: reponse,
            utiliseTousLesIndices: aTrouveAvecIndices,
            numeroDefi: defiDuJour.numero,
        })

    });

    const resultatServeur = await response.json();
    statistiquesServeur = resultatServeur.statistiques;

    const reponseNormalisee = reponse.toLowerCase();

    const essaiExistant = essais.find(
        essai => essai.texte.toLowerCase() === reponseNormalisee
    );

    if (essaiExistant) {

        essaiExistant.compteur++;

    } else {

        essais.unshift({

            texte: reponse,
            correct: resultatServeur.correct,
            compteur: 1

        });

    }
    afficherEssais();
    sauvegarderPartie();
    if (!resultatServeur.correct) {

        reduireScore(50);

    }

    if (resultatServeur.correct) {

        arreterChrono();

        partieTerminee = true;
        afficherIndices();
        console.log("AJOUT SCORE :", {
            joueur: playerId,
            points: score,
            defi: defiDuJour.numero
        });

        const scoreResponse = await fetch("/api/ajouterScore", {

            method: "POST",

            headers: {

                "Content-Type": "application/json"

            },

            body: JSON.stringify({

                playerId: playerId,

                points: score,

                numeroDefi: defiDuJour.numero,

            })

        });

        const scoreData = await scoreResponse.json();

        scoreTotal = scoreData.scoreTotal;
        streak = scoreData.streak;
        meilleurStreak = scoreData.meilleurStreak;

        scoreTotalValeur.textContent = scoreTotal;

        document.getElementById("streak").textContent =
        `🔥 ${traductions[langueActuelle].serie} : ${streak}`;

        document.getElementById("meilleurStreak").textContent =
        `🏆 ${traductions[langueActuelle].record} : ${meilleurStreak}`;

        sauvegarderPartie();

        input.disabled = true;

        popupJoueurs.textContent =
            `${statistiquesServeur.reussites} / ${statistiquesServeur.joueurs}`;

        popupPourcentage.textContent =
            resultatServeur.statistiques.pourcentage.toFixed(2) + " %";
        afficherPopupVictoire();

        resultat.textContent =
        "✅ " + traductions[langueActuelle].bonne;
        resultat.style.color = "#4CAF50";

    } else {

        resultat.textContent =
        "❌ " + traductions[langueActuelle].mauvaise;
        resultat.style.color = "#F44336";

    }

}

function afficherPopupVictoire() {

    popupNumero.textContent =
    `🌍 ${traductions[langueActuelle].defi} • #${String(defiDuJour.numero).padStart(3,"0")}`;

    popupCarte.textContent =
    carteDuJour.nom;

    popupJeu.textContent =
    carteDuJour.jeu;

    afficherDifficulte(

        popupDifficulte,
        carteDuJour.difficulte

    );

        const sauvegarde = JSON.parse(
        localStorage.getItem(window.cleDefi)
        );

        if (sauvegarde) {

            popupTemps.textContent =
            convertirTemps(sauvegarde.temps);

            popupTentatives.textContent =
            sauvegarde.tentatives + " " + traductions[langueActuelle].tentatives.toLowerCase();

        }
        else {

            popupTemps.textContent = "00:00";
            popupTentatives.textContent = "0 essais";

        }

        if (statistiquesServeur) {

            popupJoueurs.textContent =
                `${statistiquesServeur.reussites} / ${statistiquesServeur.joueurs}`;

            popupPourcentage.textContent =
                statistiquesServeur.pourcentage.toFixed(2) + " %";

        } else {

            popupPourcentage.textContent = "-- %";

        }

        popup.classList.add("popup-visible");
        popup.classList.remove("popup-cachee");
}

function convertirTemps(secondes) {

    const minutes = Math.floor(secondes / 60);

    const sec = secondes % 60;

    return `${String(minutes).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;

}

input.addEventListener("keydown", (event) => {

if (event.key === "Enter") {

    verifierReponse();

    }
});

if (fermerPopup) {

    fermerPopup.addEventListener("click", () => {

        popup.classList.remove("popup-visible");
        popup.classList.add("popup-cachee");

    });

}

async function demarrage(){

    await chargerLangue(langueActuelle);

    appliquerLangue();

    await chargerCarte();

}

demarrage();