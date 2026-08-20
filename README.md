# 🦪 Mes Huîtres — Île de Ré

Petite application pour téléphone qui note **les douzaines et demi-douzaines d'huîtres achetées
pendant les vacances**, avec le jour d'achat, la catégorie d'huîtres, et un **module de
statistiques**.

Pas de compte, pas d'internet nécessaire, pas de publicité : tout est stocké **sur le téléphone**.

| Saisie | Historique | Statistiques |
|---|---|---|
| ![Saisie](docs/screenshot-saisie.png) | ![Historique](docs/screenshot-historique.png) | ![Statistiques](docs/screenshot-stats.png) |

---

## Ce que fait l'appli

**Onglet Saisie**
- le **jour d'achat** (par défaut aujourd'hui, modifiable pour rattraper un oubli) ;
- la **catégorie d'huîtres** : fine de claire, spéciale de claire, pousse en claire, creuse n°2/3/4,
  plate (Belon)… et vous pouvez **ajouter vos propres catégories** (elles sont mémorisées) ;
- la **quantité**, avec deux compteurs séparés : **douzaines** (12 huîtres) et
  **demi-douzaines** (6 huîtres). Le total s'affiche en direct : `2,5 douzaines · 30 huîtres` ;
- une **note** facultative (la cabane, le marché…) ;
- un rappel du total **du jour** juste en dessous.

Après un enregistrement la date reste sélectionnée : pratique pour saisir plusieurs
catégories achetées le même jour.

**Onglet Historique**
- tous les achats regroupés par jour, du plus récent au plus ancien, avec le total de chaque jour ;
- **modification** (✎) et **suppression** (🗑) de chaque ligne ;
- la carte **Prix par douzaine** : un prix par catégorie, pour calculer le coût des achats
  (voir plus bas) ;
- la carte **Sauvegarde automatique** (voir plus bas) ;
- **export CSV** (ouvrable dans Excel / Numbers), sauvegarde immédiate et restauration d'un fichier.

**Onglet Stats**
- filtre de période : *tout* / *30 derniers jours* / *7 derniers jours* ;
- indicateurs : total en douzaines, nombre d'huîtres, nombre d'achats, moyenne par jour d'achat,
  et **total dépensé** si un prix est renseigné ;
- **histogramme des douzaines par jour** (le meilleur jour ressort en orange) ;
- **répartition par catégorie** (en douzaines, en % et en euros) ;
- **histogramme des dépenses par jour** et **camembert des dépenses par catégorie** (montant et %
  par catégorie, avec légende), avec un message d'aide si aucun achat de la période n'a de prix
  connu à sa date ;
- **répartition douzaines / demi-douzaines** ;
- **records** : meilleur jour, catégorie préférée, jours avec achat, moyenne par achat, rythme
  en huîtres par jour, et prix moyen à la douzaine si un prix est renseigné.

### Prix par douzaine et coût des achats

Dans l'onglet *Historique*, la carte **Prix par douzaine** permet d'indiquer, pour chaque
catégorie, un prix **à partir d'une date donnée**. C'est facultatif : une catégorie sans prix est
simplement ignorée dans les calculs de coût.

Le coût de chaque achat est calculé avec le prix qui était **en vigueur à la date de cet achat**,
pas avec le prix actuel. Concrètement :

- si le prix d'une catégorie change en cours de séjour, ajoutez un nouveau prix daté du jour du
  changement : les achats antérieurs gardent l'ancien prix, les achats à partir de cette date
  utilisent le nouveau — aucun besoin de modifier les achats déjà enregistrés ;
- pour appliquer un prix à des achats déjà passés (par exemple si vous configurez cette
  fonctionnalité après plusieurs jours de vacances), choisissez une date de prix antérieure à ces
  achats (le premier jour du séjour, par exemple) ;
- un achat dont la date est antérieure à tout prix connu pour sa catégorie n'a pas de coût calculé
  (0 €), plutôt que d'appliquer par erreur un prix qui n'était pas encore en vigueur.

L'onglet *Saisie* affiche une estimation du coût en direct dès qu'un prix est connu pour la
catégorie choisie **à la date sélectionnée dans le formulaire** — utile pour rattraper un achat
passé sans se tromper de tarif.

---

## Installer l'appli sur le téléphone

L'appli est une **PWA** : une page web qui s'installe sur l'écran d'accueil et s'ouvre
en plein écran, comme une vraie application, **même sans réseau**.

### 1. Mettre les fichiers en ligne (une seule fois, sur ordinateur)

Le dépôt est public et publié via **GitHub Pages**, réglage à faire une seule fois :

- *Settings* → **Pages** → sous *Build and deployment*, **Source : Deploy from a branch**,
  **Branch** : la branche par défaut du dépôt, dossier **/ (root)** → **Save**.

L'adresse obtenue, à ouvrir sur le téléphone :
`https://pepetechia.github.io/Huitres-il-de-re/`

Chaque modification poussée sur cette branche republie l'appli automatiquement (GitHub reconstruit
le site à chaque envoi de code, sans étape supplémentaire).

### 2. Ajouter l'appli à l'écran d'accueil (sur le téléphone)

- **iPhone / iPad (Safari)** : ouvrir l'adresse → bouton **Partager** (le carré avec la flèche)
  → **Sur l'écran d'accueil** → *Ajouter*.
- **Android (Chrome)** : ouvrir l'adresse → menu **⋮** → **Ajouter à l'écran d'accueil**
  (ou la bannière *Installer l'application*).

L'icône « Mes Huîtres » apparaît alors avec les autres applications. Une fois ouverte une
première fois, elle fonctionne **hors connexion** (plage, marché, cabane sans réseau).

### Essayer sur ordinateur, sans rien mettre en ligne

```bash
git clone https://github.com/PepetechIA/Huitres-il-de-re.git
cd Huitres-il-de-re
python3 -m http.server 8000
```

Puis ouvrir <http://localhost:8000>. (Un simple double-clic sur `index.html` marche aussi,
mais le mode hors-ligne ne s'active qu'en `http(s)://`.)

---

## Sauvegarde : rien à faire

Il n'y a **aucun bouton à presser pour sauvegarder**. Trois protections se déclenchent toutes seules.

**1. Enregistrement immédiat.** Dès l'appui sur *Enregistrer l'achat*, la donnée est écrite dans
le stockage du téléphone — sans réseau, sans compte. La ligne sous le bouton le confirme :
*« Enregistré automatiquement à 14:32 sur ce téléphone. »* L'appli demande aussi au navigateur de
**protéger ces données** (`navigator.storage.persist()`) pour qu'il ne les efface pas de lui-même
quand la mémoire du téléphone se remplit.

**2. Fichier de sauvegarde automatique.** Sans rien demander, l'appli écrit un fichier
`huitres-sauvegarde-AAAA-MM-JJ.json` dans vos téléchargements — lui-même repris par la sauvegarde
iCloud ou Google Drive du téléphone. Le rythme se règle dans l'onglet *Historique* :

| Réglage | Effet |
|---|---|
| **À chaque enregistrement** | un fichier après chaque achat saisi |
| **Une fois par jour** *(par défaut)* | un fichier au premier achat de la journée |
| **Désactivé** | aucun fichier automatique |

**3. Versions précédentes.** Avant chaque ajout, modification, suppression, restauration ou
effacement, l'appli garde une **copie horodatée** de l'état précédent (les 12 dernières).
Elles sont listées dans l'onglet *Historique* avec un bouton **Restaurer** : une ligne supprimée
par erreur, ou même un « Tout effacer » malheureux, se rattrape en deux appuis.

### Et si je change de téléphone ?

Les données appartiennent au navigateur de ce téléphone : elles ne partent sur aucun serveur.
Pour les déplacer, prenez le dernier fichier `huitres-sauvegarde-….json` et utilisez
**Restaurer un fichier** sur le nouveau téléphone.

**Exporter en CSV** donne par ailleurs un tableau `Date ; Catégorie ; Douzaines ; Demi-douzaines ;
Total douzaines ; Nb huîtres ; Prix/douzaine ; Coût ; Note`, séparé par des points-virgules et
encodé en UTF-8 avec BOM — il s'ouvre directement dans Excel en français.

---

## Contenu du dépôt

| Fichier | Rôle |
|---|---|
| `index.html` | structure de l'appli (3 onglets) |
| `app.css` | mise en forme mobile, thème clair **et** sombre automatique |
| `app.js` | logique : saisie, historique, statistiques, sauvegardes automatiques, stockage local |
| `sw.js` | *service worker* : mise en cache pour le fonctionnement hors connexion |
| `manifest.webmanifest` | déclaration PWA (nom, icônes, couleurs, plein écran) |
| `icons/` | icônes de l'application (180/192/512 px + version *maskable* Android) |
| `docs/` | captures d'écran du README |

Aucune dépendance, aucun compte, aucune étape de compilation : du HTML, du CSS et du
JavaScript standard.

### Mettre à jour l'appli installée

Après avoir modifié le code, incrémenter la version du cache dans `sw.js`
(`const CACHE = 'huitres-v1';` → `'huitres-v2'`), sinon les téléphones qui ont déjà installé
l'appli continueront de servir l'ancienne version depuis leur cache.
