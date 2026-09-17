import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Building2, ChevronRight, Search, X } from 'lucide-react';
import { useQuickSearch } from '../api/anilist/hooks';
import { useMbQuickSearch } from '../api/mangabaka/hooks';
import { useLibrary } from '../store/library';
import { useRecentResults } from '../store/recentResults';
import {
  resultsPageTerm,
  searchPageHref,
  searchSections,
  searchTerm,
  stepIndex,
  type MangaSource,
  type SearchItem,
  type SearchSection,
} from '../lib/quickSearch';
import { SCROLL_TO_TOP } from '../lib/routes';
import { statusLabel } from '../lib/trackStatus';
import styles from './QuickSearch.module.css';

/**
 * Le temps de frappe laissé avant de chercher.
 *
 * Chaque recherche coûte une requête chez AniList et une chez MangaBaka, sur
 * des quotas de 30 par minute chacun : sans ce délai, « oshi no ko » en
 * coûtait dix de chaque côté. À 300 ms, une frappe normale n'en déclenche plus
 * qu'à la pause.
 */
const DELAI_MS = 300;

/** La clé de « See all results » parmi les cibles du clavier — aucun résultat ne s'écrit ainsi. */
const TOUT = 'tout';

/**
 * La recherche générale de l'en-tête : anime, manga, personnages, staff et
 * studios, en un seul champ. Les mangas viennent de MangaBaka, le reste
 * d'AniList — voir `MangaSource`.
 *
 * Vide, le champ propose les derniers résultats ouverts. Sur la page de
 * résultats, il garde le terme qu'elle cherche, pour l'affiner.
 *
 * Le motif « combobox » : le focus RESTE dans le champ, les flèches déplacent
 * une option active que le lecteur d'écran suit par `aria-activedescendant`.
 * Entrée ouvre l'option choisie ; sans choix, la page de tous les résultats,
 * comme n'importe quel champ de recherche. On peut donc taper, corriger et
 * choisir sans jamais quitter le clavier — et le clic marche comme sur
 * n'importe quel lien, nouvel onglet compris.
 *
 * Ce qui range la réponse vit dans `lib/quickSearch`, testé.
 */
export function QuickSearch({ className }: { className?: string }) {
  const { pathname, search } = useLocation();
  const termePage = resultsPageTerm(pathname, search);

  const [saisie, setSaisie] = useState(termePage);
  /* Le terme cherché, en retard de `DELAI_MS` sur la saisie. */
  const [terme, setTerme] = useState(termePage);
  const [ouvert, setOuvert] = useState(false);
  /* L'option active, par sa CLÉ et liée à ce que le panneau montrait quand on
     l'a choisie. Une nouvelle recherche repart SANS choix, sans effet à
     synchroniser — et Entrée mène alors à tous les résultats. Quand la section
     des mangas arrive après les autres, le surlignage reste sur le même
     résultat au lieu de glisser d'un cran. */
  const [choix, setChoix] = useState<{ pour: string; cle: string } | null>(null);

  /* La page change de recherche, ou n'en montre plus : le champ suit. Arriver
     sur les résultats de « naruto » y écrit « naruto », en repartir vers une
     fiche le vide. Ajusté pendant le rendu plutôt que dans un effet, qui
     afficherait un instant l'ancien texte. */
  const [pageVue, setPageVue] = useState(termePage);
  if (pageVue !== termePage) {
    setPageVue(termePage);
    setSaisie(termePage);
    setTerme(termePage);
    setChoix(null);
    setOuvert(false);
  }

  const champ = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const id = useId();
  const listeId = `${id}-resultats`;

  useEffect(() => {
    const t = setTimeout(() => setTerme(searchTerm(saisie)), DELAI_MS);
    return () => clearTimeout(t);
  }, [saisie]);

  /* Rien ne part tant que le panneau est fermé. Sur la page de résultats, le
     champ garde son terme : le chercher en fond coûterait deux requêtes à
     chaque visite, pour un panneau que personne n'a ouvert. */
  const demande = ouvert ? terme : '';
  const { data, isFetching, isError } = useQuickSearch(demande);
  const mb = useMbQuickSearch(demande);

  const recents = useRecentResults((s) => s.items);
  const retenir = useRecentResults((s) => s.remember);
  const oublier = useRecentResults((s) => s.clear);

  /* Le champ vide montre les derniers résultats ouverts, au lieu de rien. */
  const vide = saisie.trim() === '';

  const sections = useMemo((): SearchSection[] => {
    if (vide)
      return recents.length > 0 ? [{ kind: 'recent', label: 'Recent', items: recents }] : [];
    const manga: MangaSource = mb.data
      ? { from: 'mangabaka', ...mb.data }
      : mb.isError
        ? { from: 'anilist' }
        : { from: 'pending' };
    return searchSections(data, manga);
  }, [vide, recents, data, mb.data, mb.isError]);
  const items = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  /* « See all results », tout en bas : une cible du clavier comme les autres,
     pour y descendre sans quitter le champ. Seulement quand le panneau a déjà
     des résultats à montrer — sous « No results », elle ne mènerait à rien, et
     les derniers ouverts ne sont pas une recherche. */
  const toutVoir = searchPageHref(searchTerm(saisie));
  const cibles = useMemo<{ key: string; href: string; item?: SearchItem }[]>(() => {
    const lignes = items.map((item) => ({ key: item.key, href: item.href, item }));
    return !vide && lignes.length > 0 ? [...lignes, { key: TOUT, href: toutVoir }] : lignes;
  }, [items, toutVoir, vide]);
  const rangs = useMemo(() => new Map(cibles.map((c, i) => [c.key, i])), [cibles]);

  const entries = useLibrary((s) => s.entries);

  /* Le panneau suit la SAISIE et non le terme : effacer le champ le ferme
     tout de suite, sans attendre le délai. */
  const visible = ouvert && (searchTerm(saisie) !== '' || (vide && recents.length > 0));
  const enRetard = !vide && (terme !== searchTerm(saisie) || isFetching || mb.isFetching);
  /* Ce que montre le panneau, auquel le choix est lié : un terme, ou les
     derniers ouverts. */
  const contexte = vide ? '' : terme;
  const actif = (choix?.pour === contexte ? rangs.get(choix.cle) : undefined) ?? -1;

  /* Le terme de la page déjà dans le champ : ses suggestions répéteraient ce
     qu'elle montre juste en dessous. Le panneau attend qu'on tape. */
  const surSaPage = termePage !== '' && searchTerm(saisie) === termePage;

  /* « / » comme sur GitHub, et Ctrl+K pour qui l'a dans les doigts. Pas quand
     on écrit ailleurs, et pas quand l'en-tête est inerte — le lecteur agrandi
     couvre alors la page. */
  useEffect(() => {
    const surTouche = (e: globalThis.KeyboardEvent) => {
      const cible = e.target;
      const ecrit =
        cible instanceof HTMLElement &&
        (cible.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible.tagName));
      const raccourci =
        (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !e.altKey) ||
        (e.key === '/' && !ecrit && !e.ctrlKey && !e.metaKey && !e.altKey);
      const input = champ.current;
      if (!raccourci || !input || input.closest('[inert]')) return;
      e.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, []);

  /* Après un choix, le champ se vide : la barre d'en-tête ne garde pas la
     trace d'une recherche déjà aboutie. Sauf vers la page de résultats, qui
     montre le terme — `vider` à faux. */
  const fermer = (vider = true) => {
    setOuvert(false);
    if (vider) {
      setSaisie('');
      setTerme('');
    }
    setChoix(null);
    champ.current?.blur();
  };

  const surClavier = (e: KeyboardEvent<HTMLInputElement>) => {
    /* Une saisie japonaise passe par une composition : l'Entrée qui la
       valide ne doit pas ouvrir une fiche. */
    if (e.nativeEvent.isComposing) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (searchTerm(saisie) === '' && !(vide && recents.length > 0)) return;
      e.preventDefault();
      /* Panneau fermé — par Échap, ou sur la page de résultats : la flèche
         l'ouvre, sur le même choix. */
      if (!visible) {
        setOuvert(true);
        return;
      }
      const suivant = cibles[stepIndex(actif, cibles.length, e.key === 'ArrowDown' ? 1 : -1)];
      if (suivant) setChoix({ pour: contexte, cle: suivant.key });
    } else if (e.key === 'Enter') {
      /* Le terme TAPÉ, pas celui qui attend son délai : Entrée juste après la
         dernière lettre cherche bien ce qui est écrit. Même panneau fermé par
         Échap, ou résultats pas encore arrivés. */
      const cherche = searchTerm(saisie);
      const cible = visible ? cibles[actif] : undefined;
      if (!cible && !cherche) return;
      e.preventDefault();
      if (cible?.item) retenir(cible.item);
      navigate(cible ? cible.href : searchPageHref(cherche), { state: SCROLL_TO_TOP });
      fermer(Boolean(cible?.item));
    } else if (e.key === 'Escape') {
      /* Deux temps : fermer le panneau d'abord, en gardant le texte pour y
         revenir ; vider ensuite. */
      e.preventDefault();
      if (visible) setOuvert(false);
      else {
        setSaisie('');
        setChoix(null);
      }
    }
  };

  const statut = (item: SearchItem): string | null => {
    const entry = item.libraryKey ? entries[item.libraryKey] : undefined;
    return entry ? statusLabel(entry.status, entry.media) : null;
  };

  let message = '';
  if (visible && !vide && sections.length === 0) {
    if (enRetard) message = 'Searching…';
    else if (isError) message = 'Couldn’t reach AniList.';
    else message = `No results for “${terme}”.`;
  }
  const compte = `${items.length} ${vide ? 'recent result' : 'result'}${items.length > 1 ? 's' : ''}`;

  return (
    <div
      className={`${styles.recherche} ${className ?? ''}`}
      onBlur={(e) => {
        if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) {
          setOuvert(false);
        }
      }}
    >
      <div className={styles.champ}>
        <Search size={15} strokeWidth={1.8} aria-hidden className={styles.loupe} />
        <input
          ref={champ}
          className={styles.saisie}
          type="text"
          role="combobox"
          aria-label="Search anime, manga, characters, staff and studios"
          aria-expanded={visible}
          aria-controls={listeId}
          aria-autocomplete="list"
          aria-activedescendant={visible && actif >= 0 ? `${id}-option-${actif}` : undefined}
          placeholder="Search anime, manga, characters…"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          value={saisie}
          onChange={(e) => {
            setSaisie(e.target.value);
            setOuvert(true);
            /* Taper efface le choix fait aux flèches. Sans ça, retaper la même
               recherche retrouvait l'ancien choix, et Entrée l'ouvrait au lieu
               de tous les résultats. */
            setChoix(null);
          }}
          onFocus={() => {
            if (!surSaPage) setOuvert(true);
          }}
          onKeyDown={surClavier}
        />
        {saisie ? (
          <button
            type="button"
            className={styles.effacer}
            aria-label="Clear search"
            onClick={() => {
              setSaisie('');
              setChoix(null);
              /* Ouvert d'office : le champ vide propose les derniers résultats,
                 et c'est souvent pour en chercher un autre qu'on efface. */
              setOuvert(true);
              champ.current?.focus();
            }}
          >
            <X size={14} strokeWidth={2} aria-hidden />
          </button>
        ) : (
          <kbd className={styles.touche} aria-hidden>
            /
          </kbd>
        )}
      </div>

      {visible && (
        /* `preventDefault` au clic : le focus reste dans le champ. Sans lui,
           Safari retire le focus avant que le clic n'atteigne le lien, le
           panneau se ferme, et le clic tombe dans le vide. */
        <div
          className={styles.panneau}
          data-colonnes={sections.length > 1 ? 2 : 1}
          onMouseDown={(e) => e.preventDefault()}
        >
          {vide && (
            /* Hors de la liste : un bouton n'est pas une option, et une liste
               d'options n'admet qu'elles. */
            <div className={styles.recentsTete}>
              <p id={`${id}-recent`} className="label">
                Recent
              </p>
              <button
                type="button"
                className={styles.oublier}
                onClick={() => {
                  oublier();
                  champ.current?.focus();
                }}
              >
                Clear
              </button>
            </div>
          )}

          <ul
            id={listeId}
            role="listbox"
            aria-label={vide ? 'Recent results' : 'Search results'}
            aria-busy={enRetard}
            className={styles.sections}
          >
            {sections.map((section) => (
              <li key={section.kind} role="presentation" className={styles.section}>
                {section.kind !== 'recent' && (
                  <p id={`${id}-${section.kind}`} className={`label ${styles.titreSection}`}>
                    {section.label}
                  </p>
                )}
                <ul role="group" aria-labelledby={`${id}-${section.kind}`} className={styles.liste}>
                  {section.items.map((item) => {
                    const rang = rangs.get(item.key) ?? -1;
                    const suivi = statut(item);
                    return (
                      <li
                        key={item.key}
                        id={`${id}-option-${rang}`}
                        role="option"
                        aria-selected={rang === actif}
                        className={styles.option}
                      >
                        <Link
                          to={item.href}
                          state={SCROLL_TO_TOP}
                          tabIndex={-1}
                          className={styles.lien}
                          onClick={(e) => {
                            retenir(item);
                            // Un clic avec modificateur ouvre un onglet : on reste ici.
                            if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) fermer();
                          }}
                        >
                          <Vignette item={item} />
                          <span className={styles.texte}>
                            <span className={styles.nom}>{item.title}</span>
                            {(item.meta || suivi) && (
                              <span className={styles.meta}>
                                {item.meta}
                                {item.meta && suivi && ' · '}
                                {suivi && <span className={styles.suivi}>{suivi}</span>}
                              </span>
                            )}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
            {!vide && items.length > 0 && (
              <li
                id={`${id}-option-${rangs.get(TOUT) ?? -1}`}
                role="option"
                aria-selected={rangs.get(TOUT) === actif}
                className={`${styles.option} ${styles.toutVoir}`}
              >
                <Link
                  to={toutVoir}
                  state={SCROLL_TO_TOP}
                  tabIndex={-1}
                  className={styles.lienTout}
                  onClick={(e) => {
                    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) fermer(false);
                  }}
                >
                  See all results for “{searchTerm(saisie)}”
                  <ChevronRight size={14} strokeWidth={2.2} aria-hidden />
                </Link>
              </li>
            )}
          </ul>

          {/* Toujours présent : c'est lui que le lecteur d'écran écoute pour
              annoncer « Searching… », l'absence de résultat ou leur nombre. */}
          <p role="status" className={message ? styles.etat : 'sr-only'}>
            {message || (!enRetard && items.length > 0 ? compte : '')}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * L'image d'un résultat, dans la forme de ce qu'il est : une affiche pour une
 * œuvre, un portrait rond pour une personne, un pictogramme pour un studio —
 * AniList n'a pas de logo de studio. La forme dit la catégorie avant le texte.
 */
function Vignette({ item }: { item: SearchItem }) {
  if (item.kind === 'studio') {
    return (
      <span className={`${styles.vignette} ${styles.studio}`} aria-hidden>
        <Building2 size={16} strokeWidth={1.8} />
      </span>
    );
  }
  const forme = item.kind === 'anime' || item.kind === 'manga' ? styles.affiche : styles.portrait;
  return item.image ? (
    <img src={item.image} alt="" loading="lazy" className={`${styles.vignette} ${forme}`} />
  ) : (
    <span className={`${styles.vignette} ${forme} placeholder`} aria-hidden />
  );
}
