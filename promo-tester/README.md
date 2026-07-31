# Promo Code Tester 🏷️

Extension Chrome qui teste automatiquement une liste de codes promo sur la page
panier d'un site marchand et garde **celui qui donne le total le plus bas**.

Pensée pour faire des achats « toujours en solde » (par ex. l'ameublement d'un
déménagement) sans coller manuellement des dizaines de codes.

## Ce que fait l'extension

1. Vous ouvrez la page **panier / commande** du site.
2. (Facultatif mais recommandé) vous cliquez sur **🔎 Trouver les codes du
   site** : l'extension lit les codes déjà présents dans la page (bannières,
   scripts, `dataLayer`, JSON de config…) et les ajoute **en tête** de la liste.
3. Vous cliquez sur **▶ Lancer la recherche**.
4. L'extension :
   - détecte le champ « code promo », le bouton « appliquer » et le montant total ;
   - saisit et applique chaque code de la liste, un par un ;
   - lit le nouveau total après chaque essai ;
   - mémorise le meilleur code (total le plus bas) trouvé jusque-là.
5. À la fin de la liste **ou** dès que vous cliquez sur **■ Stopper**, elle
   **réapplique automatiquement le meilleur code** trouvé.

## Trouver les codes du site (« console »)

Le bouton **🔎 Trouver les codes du site** analyse **uniquement ce que le site
a déjà envoyé à votre navigateur** :

- le texte visible de la page (bannières « utilisez le code … ») ;
- le HTML et les scripts en ligne ;
- les objets globaux JS courants (`dataLayer`, `__NEXT_DATA__`, `__NUXT__`,
  `__INITIAL_STATE__`, `__APOLLO_STATE__`…) ;
- les scripts *same-origin* déjà chargés (relus depuis le cache).

Les codes trouvés sont ceux qui ont le plus de chances d'être valides sur ce
site précis, donc ils sont testés **en premier**. C'est ce que vous feriez à la
main dans la console (F12) en fouillant les sources — automatisé.

**Ce que ça ne fait pas** (et ne fera pas) : interroger le serveur pour
« deviner » des codes (force brute, ça fait bannir), ni accéder à la base de
données ou à une zone privée du site (ce serait de l'intrusion informatique,
illégale). On lit vos propres données côté client, rien d'autre.

## Installation (mode développeur)

1. Ouvrez `chrome://extensions` dans Chrome (ou Edge/Brave).
2. Activez le **Mode développeur** (en haut à droite).
3. Cliquez sur **Charger l'extension non empaquetée**.
4. Sélectionnez le dossier `promo-tester/`.
5. L'icône apparaît dans la barre d'outils : épinglez-la.

## Utilisation

- Ouvrez la page **panier** du site, puis cliquez sur l'icône de l'extension.
- **Si le popup cache le champ code promo** (le popup de Chrome est collé à la
  barre d'outils et ne se déplace pas) : cliquez sur **📌 Afficher le panneau
  déplaçable sur la page**. Un petit panneau apparaît dans la page ; **glissez
  sa barre de titre** pour le poser où vous voulez et dégager le champ. Il
  contient les mêmes commandes (Lancer, Stopper, Trouver les codes, 🎯 Ouvrir /
  Champ / Total) et ne se ferme pas quand vous cliquez ailleurs.
- Les pastilles « Champ » et « Total » indiquent si la détection automatique a
  réussi. Sinon, utilisez **🎯 Champ** / **🎯 Total** puis cliquez directement
  sur l'élément concerné dans la page.
- **Champ caché dans un panneau qui se referme** (ex. Maison du Monde : le champ
  n'apparaît qu'après un clic sur « Ajouter un code promo », et le panneau se
  referme quand un code est refusé) : l'extension rouvre automatiquement ce
  panneau avant chaque essai. Si elle ne trouve pas le bon bouton, utilisez
  **🎯 Ouvrir** puis cliquez sur le bouton « Ajouter un code promo ».
- **Réglages & liste de codes** : modifiez la liste (un code par ligne) et le
  délai entre les essais.

## Réglages importants

- **Délai entre les essais** : par défaut 700 ms. Ne descendez pas trop bas :
  aller « à la vitesse de la lumière » fait déclencher les protections
  anti-abus du site (blocage temporaire, captcha, voire bannissement d'IP).
  500–1000 ms est un bon compromis vitesse/discrétion.
- **Liste de codes** : ce sont des codes *connus et courants* (bienvenue,
  newsletter, soldes, livraison offerte…). Ce **n'est pas de la force brute** —
  tester toutes les combinaisons possibles est irréaliste et abusif.

## Limites

- La détection automatique du champ et du total repose sur des heuristiques :
  sur certains sites il faudra sélectionner manuellement (boutons 🎯).
- Suppose qu'un seul code peut être actif à la fois (cas le plus fréquent :
  appliquer un nouveau code remplace le précédent).
- Certaines boutiques cumulent les codes ou bloquent après quelques essais.

## Usage responsable

Cet outil automatise une action que vous pouvez faire à la main. Respectez les
**conditions d'utilisation** des sites que vous visitez et restez raisonnable
sur la cadence. À utiliser pour vos propres achats.

## Structure

| Fichier        | Rôle                                                        |
|----------------|-------------------------------------------------------------|
| `manifest.json`| Déclaration de l'extension (Manifest V3).                   |
| `content.js`   | Injecté dans la page : détection, boucle d'essais, meilleur code. |
| `codes.js`     | Liste de codes par défaut.                                  |
| `popup.html/css/js` | Interface : lancer/stopper, progression, réglages.     |
