import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AniListError } from './api/anilist/client';
import App from './App.tsx';
import { installFlushOnHide } from './platform/storage';
import { useLibrary } from './store/library';
import { useArtwork } from './store/artwork';
import { useFavourites } from './store/favourites';
import { useLists } from './store/lists';
import { useThemes } from './store/themes';
import { useSongs } from './store/songs';
import { usePlaylists } from './store/playlists';
import { useLiveChart } from './store/livechart';
import './styles/tokens.css';
import './styles/base.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // AniList plafonne à 30 requêtes/minute : on ne redemande pas
      // au moindre retour d'onglet.
      refetchOnWindowFocus: false,
      gcTime: 30 * 60_000,

      /* Un 429 n'est pas une panne, c'est une attente : AniList dit lui-même
         combien de secondes. Le traiter comme une erreur ordinaire faisait
         abandonner après deux réessais trop rapprochés — visible dès qu'une
         page enchaîne ses pages, comme le catalogue d'un studio. */
      retry: (failures, error) =>
        error instanceof AniListError && error.status === 429 ? failures < 4 : failures < 2,
      retryDelay: (failures, error) => {
        if (error instanceof AniListError && error.retryAfter) {
          return (error.retryAfter + 1) * 1000;
        }
        return Math.min(1000 * 2 ** failures, 8000);
      },
    },
  },
});

// Charge la bibliothèque avant le premier rendu utile.
void useLibrary.getState().hydrate();
/* Et les affiches choisies : elles habillent les mêmes cartes, une seconde
   lecture les ferait toutes clignoter de l'image d'origine à la sienne. */
void useArtwork.getState().hydrate();
void useFavourites.getState().hydrate();
/* Les listes composees a la main : elles ne portent que des cles, la
   bibliotheque fournit titres et affiches. */
void useLists.getState().hydrate();

/* Les generiques : le catalogue est un cache, les notes sont precieuses — deux
   stores, voir `store/themes` et `store/songs`. */
void useThemes.getState().hydrate();
void useSongs.getState().hydrate();
void usePlaylists.getState().hydrate();
/* Les sorties francaises : un cache aussi, lu tot pour que le calendrier
   s'ouvre avec ses heures au lieu de les attendre de LiveChart. */
void useLiveChart.getState().hydrate();
installFlushOnHide();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
