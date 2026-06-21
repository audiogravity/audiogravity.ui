FRONTEND CONTEXT
1. Respecter l'architecture LitElement du Frontend.
   - Toute nouvelle UI doit être un composant LitElement dédié — jamais du HTML inline dans un organisme existant.
   - Hiérarchie : atoms < molecules < organisms < pages. Un composant ne doit pas gérer la logique d'un niveau supérieur.
   - Molecules : logique autonome (API calls, state propre), light DOM, JSDoc complet, fichier .stories.js obligatoire.
   - Organisms : orchestrent les molecules, ne contiennent pas de logique métier inline extractible.
   - Tout nouveau composant doit être enregistré dans `js/main.js`.
   - Avant d'ajouter du code dans un fichier existant, vérifier si le bloc mérite son propre composant (>~50 lignes de template ou logique réutilisable = composant séparé).
2. Toujours documenter le code en JSDoc.
3. Créer et mettre à jour les stories.
4. Démarrer le frontend avec `./dev.sh start` et l'arrêter avec `./dev.sh stop`.
5. CSS — conventions de namespacing par composant :
   - `lib-`   → styles partagés library, injectés par `ag-library-page.js` (LIB_STYLES)
   - `npfs-`  → fullscreen player, injectés par `ag-now-playing-fullscreen.js` (NPFS_STYLES)
   - `ag-pc-` → ag-playback-controls
   - `ag-st-` → ag-sleep-timer
   Ne jamais dupliquer ou modifier ces styles dans un autre fichier.
6. CSS — variables thème : OBLIGATOIRES, sauf besoin spécifique justifié.
   Toujours utiliser les tokens AG ci-dessous. Jamais de valeurs hardcodées (`#888`, `13px`, `'Inter'`...).
   Jamais de variables wrapper locales (type `--lib-*`, `--npfs-*`) qui dupliquent ou décalent les tokens AG —
   utiliser directement les `--xxx` du système. Les wrappers cassent les thèmes et créent une double indirection.
   - Typographie : `--font-family`, `--font-mono`, `--font-size-xxs`, `--font-size-xs`, `--font-size-sm`, `--font-size-md`, `--font-size-lg`, `--font-size-xl`, `--font-size-xxl`, `--font-size-xxxl`
   - Espacements : `--spacing-xs`, `--spacing-sm`, `--spacing-md`, `--spacing-lg`, `--spacing-xl`
   - Arrondis : `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-full`
   - Transitions : `--transition-fast`, `--transition-normal`
   - Couleurs : `--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--text-primary`, `--text-secondary`, `--text-tertiary`, `--border-color`, `--accent-primary`, `--color-success`, `--color-warning`, `--color-error`
   - **Police mono** : ne JAMAIS forcer `'JetBrains Mono'` ou autre famille spécifique. Utiliser `var(--font-mono)`. Pour les labels/badges uppercase, c'est `var(--font-family)` (Inter), pas mono.
   - **Boutons** : utiliser `.action-btn` (+ `.primary`, `.secondary`, `.compact`...) plutôt que des styles inline ou des classes custom locales.
   - **Exception légitime** : si un composant a un vrai besoin visuel non couvert (ex: bloc de code mono explicite), documenter le pourquoi en commentaire CSS.
7. Avant tout commit, exécuter `npx stylelint "css/**/*.css"` pour valider les fichiers CSS modifiés.
8. **Icônes SVG inline** : `js/ag-icons.js` est la **librairie d'icônes SVG canonique d'AG**. Toute icône SVG inline (`<path>`, `<polygon>`, `<circle>`, `<line>`, `<rect>`, `<ellipse>`...) DOIT y vivre et être importée depuis ses call-sites (`import { iconX } from '../../ag-icons.js'`). Pas de seuil "≥N usages" — même les one-shots y vont, parce que la lisibilité du template (`${iconQueue}` vs raw `<path>`) et la centralisation visuelle l'emportent sur le coût de nommer l'icône. **Exceptions** qui restent inline mais DOIVENT être commentées avec la raison : logo AG, glyphes intégrés à une composition unique avec transforms/animations locales fortement couplées, SVG construit dynamiquement (path calculé par JS). **Hors scope** : les glyphes icomoon (`<span class="icon-music">`) qui sont un autre système (icon font), pas concernés par cette règle. Toujours utiliser le tag `svg\`\`` de Lit (pas `html\`\``) pour le contenu nested dans un `<svg>` parent — sinon le contenu est créé en namespace HTML et n'est pas rendu.
   **Source canonique des icônes : Lucide** (https://lucide.dev, MIT). Tout nouvel icône doit être tiré de Lucide — récupérer le path SVG brut depuis `https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/<name>.svg`, extraire le contenu interne (sans la balise `<svg>`), et l'ajouter dans `ag-icons.js` avec un commentaire `(Lucide: <name>)`. Les icônes custom (connecteurs hardware, glyphes AG-spécifiques sans équivalent Lucide) restent autorisées mais doivent être documentées `(custom)`. Tous les `<svg>` appelants utilisent `viewBox="0 0 24 24"`.
9. **DRY — réutiliser avant d'écrire**. Avant d'introduire une fonction utilitaire, une constante partagée, un helper réseau ou tout pattern technique non-métier, **grep d'abord** pour vérifier qu'un équivalent n'existe pas déjà. Inventaire connu (non exhaustif) :
   - `js/api.js` (clients REST : `apiGet/Post/Put/Delete`, gestion 204)
   - `js/ag-icons.js` (toutes les icônes SVG)
   - `js/components/utils-lit.js` (`coverUrl`, formatters)
   - `js/components/library-constants.js` (listes pays/genres)
   - Variables CSS `--xxx` (jamais de wrapper `--lib-*`, cf. règle 6)

   **Signaux de copier-coller à proscrire** : deux blocs fetch quasi identiques, des constantes `_USER_AGENT` répétées, une fonction utilitaire redéfinie dans plusieurs composants. Dès qu'un de ces signaux apparaît : **extraire** dans `js/api.js` ou `js/common.js` et faire pointer tous les call-sites dessus. La duplication n'est pas négociable : pas de seuil "≥ N usages" — la deuxième occurrence déclenche l'extraction.
