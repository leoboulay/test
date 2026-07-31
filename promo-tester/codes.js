// Liste de codes promo testés par défaut.
// Ce N'EST PAS de la force brute : on ne teste pas toutes les combinaisons de
// caractères possibles (des milliards, blocage immédiat), mais des codes
// « lisibles » réellement utilisés par les boutiques : mots-clés marketing
// (bienvenue, soldes, livraison…) combinés à des montants courants.
// La vraie mine d'or reste le bouton « Trouver les codes du site » (voir
// content.js) qui lit les codes déjà présents dans la page.

(function () {
  // Mots-clés d'action fréquents (FR + EN + thème déménagement/maison).
  const PREFIXES = [
    "SAVE", "WELCOME", "HELLO", "HI", "GET", "TAKE", "EXTRA", "ENJOY", "SCORE",
    "PROMO", "DEAL", "DEALS", "SALE", "SALES", "OFFER", "SPECIAL", "VIP", "MEMBER",
    "NEW", "NEWBIE", "FIRST", "FIRSTORDER", "NEWCUSTOMER", "STUDENT", "APP", "MOBILE",
    "SPRING", "SUMMER", "FALL", "AUTUMN", "WINTER", "HOLIDAY", "XMAS", "NEWYEAR",
    "BLACKFRIDAY", "CYBER", "CYBERMONDAY", "SINGLES", "PRIME",
    "HOME", "HOUSE", "DECOR", "DECO", "FURNITURE", "MOVE", "MOVING", "MOVEIN",
    // Français
    "BIENVENUE", "MERCI", "CADEAU", "OFFRE", "BON", "PROMO", "RABAIS", "REDUC",
    "REDUCTION", "SOLDES", "NOEL", "PAQUES", "RENTREE", "PRINTEMPS", "ETE",
    "NEWSLETTER", "INSCRIPTION", "FIDELITE", "PARRAINAGE", "PREMIERE",
    "MAISON", "MEUBLE", "MEUBLES", "DECOMAISON", "DEMENAGEMENT", "EMMENAGEMENT",
  ];
  // Montants de remise usuels.
  const NUMS = [5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 70];
  // Codes « livraison offerte » et divers, ajoutés tels quels.
  const SPECIALS = [
    "FREESHIP", "FREESHIPPING", "SHIPFREE", "NOSHIP", "FREEDELIVERY",
    "LIVRAISON", "LIVRAISONGRATUITE", "LIVRAISONOFFERTE", "FRANCODEPORT",
    "FDP", "FDPOFFERT", "PORTOFFERT", "PORTGRATUIT", "0FRAIS",
    "THANKS", "THANKYOU", "LOYALTY", "GIFT", "SURPRISE", "LUCKY", "BONUS",
    "MERCI", "CADEAU", "OFFERT", "SURPRISE10", "BIENVENUE", "SOLDES",
  ];

  const set = new Set();
  const add = (c) => { if (c && c.length >= 3 && c.length <= 22) set.add(c.toUpperCase()); };

  for (const p of PREFIXES) {
    add(p);                    // WELCOME
    for (const n of NUMS) {
      add(p + n);              // WELCOME10
      add(p + n + "OFF");      // WELCOME10OFF
      add(n + p);              // 10WELCOME
    }
  }
  for (const n of NUMS) {
    add(n + "OFF");            // 10OFF
    add("OFF" + n);            // OFF10
    add("SAVE" + n + "OFF");
  }
  for (const s of SPECIALS) add(s);

  window.PROMO_DEFAULT_CODES = [...set].sort();
})();
