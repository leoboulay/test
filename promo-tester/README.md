# Promo Code Tester 🏷️

Extension Chrome qui teste automatiquement une liste de codes promo sur la page
panier d'un site marchand et garde **celui qui donne le total le plus bas**.

Pensée pour faire des achats « toujours en solde » (par ex. l'ameublement d'un
déménagement) sans coller manuellement des dizaines de codes.

## Ce que fait l'extension

1. Vous ouvrez la page **panier / commande** du site.
2. Vous cliquez sur **▶ Lancer la recherche**.
3. L'extension :
   - détecte le champ « code promo », le bouton « appliquer » et le montant total ;
   - saisit et applique chaque code de la liste, un par un ;
   - lit le nouveau total après chaque essai ;
   - mémorise le meilleur code (total le plus bas) trouvé jusque-là.
4. À la fin de la liste **ou** dès que vous cliquez sur **■ Stopper**, elle
   **réapplique automatiquement le meilleur code** trouvé.

## Installation (mode développeur)

1. Ouvrez `chrome://extensions` dans Chrome (ou Edge/Brave).
2. Activez le **Mode développeur** (en haut à droite).
3. Cliquez sur **Charger l'extension non empaquetée**.
4. Sélectionnez le dossier `promo-tester/`.
5. L'icône apparaît dans la barre d'outils : épinglez-la.

## Utilisation

- Ouvrez la page **panier** du site, puis cliquez sur l'icône de l'extension.
- Les pastilles « Champ » et « Total » indiquent si la détection automatique a
  réussi. Sinon, utilisez **🎯 Champ** / **🎯 Total** puis cliquez directement
  sur l'élément concerné dans la page.
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
