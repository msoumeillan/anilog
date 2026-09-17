import { describe, expect, it } from 'vitest';
import { malDate, parseMalXml } from './malImport';

/**
 * Un import se juge sur les cas TORDUS, pas sur le cas propre : une date à
 * zéro, un titre avec une esperluette, un statut écrit autrement. C'est là que
 * se perdent des centaines de lignes sans que personne le remarque.
 */

const anime = (dedans: string) => `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
  <myinfo>
    <user_name>exemple</user_name>
    <user_export_type>1</user_export_type>
  </myinfo>
  ${dedans}
</myanimelist>`;

const bloc = `
  <anime>
    <series_animedb_id>21</series_animedb_id>
    <series_title><![CDATA[One Piece]]></series_title>
    <series_episodes>0</series_episodes>
    <my_watched_episodes>1100</my_watched_episodes>
    <my_start_date>2019-04-01</my_start_date>
    <my_finish_date>0000-00-00</my_finish_date>
    <my_score>9</my_score>
    <my_status>Watching</my_status>
    <my_comments><![CDATA[Le meilleur.]]></my_comments>
    <my_times_watched>2</my_times_watched>
    <my_tags><![CDATA[shonen, a relire]]></my_tags>
  </anime>`;

describe('parseMalXml', () => {
  it('lit une entrée complète', () => {
    const r = parseMalXml(anime(bloc));
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.export.media).toBe('anime');
    expect(r.export.username).toBe('exemple');
    expect(r.export.entries[0]).toEqual({
      malId: 21,
      title: 'One Piece',
      status: 'current',
      score: 9,
      episodes: 1100,
      chapters: undefined,
      volumes: undefined,
      total: undefined,
      startedAt: '2019-04-01T12:00:00.000Z',
      finishedAt: undefined,
      tags: ['shonen', 'a relire'],
      comments: 'Le meilleur.',
      rewatched: 2,
    });
  });

  it('traduit les cinq statuts, quelle que soit leur graphie', () => {
    const cas: [string, string][] = [
      ['Watching', 'current'],
      ['Reading', 'current'],
      ['Completed', 'completed'],
      ['On-Hold', 'paused'],
      // Vu dans de vieux exports : sans le tiret.
      ['On Hold', 'paused'],
      ['Dropped', 'dropped'],
      ['Plan to Watch', 'planned'],
      ['Plan to Read', 'planned'],
    ];
    for (const [brut, attendu] of cas) {
      const xml = anime(
        `<anime><series_animedb_id>1</series_animedb_id><my_status>${brut}</my_status></anime>`,
      );
      const r = parseMalXml(xml);
      expect(r.ok && r.export.entries[0]?.status, brut).toBe(attendu);
    }
  });

  it('range un statut inconnu dans « à voir » plutôt que de perdre l’œuvre', () => {
    const r = parseMalXml(
      anime(`<anime><series_animedb_id>1</series_animedb_id><my_status>Zzz</my_status></anime>`),
    );
    expect(r.ok && r.export.entries[0]?.status).toBe('planned');
  });

  it('traite le zéro de MAL comme « pas de note »', () => {
    /* Zéro n'est pas une note sur MAL, c'est l'absence de note. La garder
       ferait une moyenne fausse et une courbe pleine de zéros. */
    const r = parseMalXml(
      anime(`<anime><series_animedb_id>1</series_animedb_id><my_score>0</my_score></anime>`),
    );
    expect(r.ok && r.export.entries[0]?.score).toBeUndefined();
  });

  it('garde une progression à zéro : c’est une vraie valeur', () => {
    // Zéro épisode vu, c'est une information ; zéro note, non.
    const r = parseMalXml(
      anime(
        `<anime><series_animedb_id>1</series_animedb_id><my_watched_episodes>0</my_watched_episodes></anime>`,
      ),
    );
    expect(r.ok && r.export.entries[0]?.episodes).toBe(0);
  });

  it('décode les entités et les CDATA des titres', () => {
    /* « Fate/stay night: Unlimited Blade Works » et consorts : les titres MAL
       portent des esperluettes et des chevrons, échappés par XML. */
    const r = parseMalXml(
      anime(
        `<anime><series_animedb_id>1</series_animedb_id><series_title>Fruits Basket &amp; co &lt;2019&gt;</series_title></anime>`,
      ),
    );
    expect(r.ok && r.export.entries[0]?.title).toBe('Fruits Basket & co <2019>');
  });

  it('lit un export manga et ses champs propres', () => {
    const xml = `<myanimelist><myinfo><user_export_type>2</user_export_type></myinfo>
      <manga>
        <series_mangadb_id>13</series_mangadb_id>
        <series_title><![CDATA[One Piece]]></series_title>
        <series_chapters>1100</series_chapters>
        <my_read_chapters>950</my_read_chapters>
        <my_read_volumes>95</my_read_volumes>
        <my_status>Reading</my_status>
      </manga></myanimelist>`;
    const r = parseMalXml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.export.media).toBe('manga');
    expect(r.export.entries[0]).toMatchObject({
      malId: 13,
      chapters: 950,
      volumes: 95,
      total: 1100,
      episodes: undefined,
      status: 'current',
    });
  });

  it('devine le média quand `myinfo` manque', () => {
    // Certains outils tiers retirent l'en-tête.
    const xml = `<myanimelist><manga><series_mangadb_id>13</series_mangadb_id></manga></myanimelist>`;
    const r = parseMalXml(xml);
    expect(r.ok && r.export.media).toBe('manga');
  });

  it('saute UNE entrée sans identifiant sans perdre les autres', () => {
    /* Une ligne abîmée au milieu d'un export ne doit pas emporter la liste.
       Le cas où AUCUNE n'a d'identifiant est autre chose — c'est un format
       qu'on ne sait pas lire, et il est traité plus bas. */
    const r = parseMalXml(
      anime(
        `<anime><series_title>Sans id</series_title></anime>` +
          `<anime><series_animedb_id>21</series_animedb_id></anime>`,
      ),
    );
    expect(r.ok && r.export.entries.map((e) => e.malId)).toEqual([21]);
  });

  it('nomme une entrée sans titre par son identifiant', () => {
    const r = parseMalXml(anime(`<anime><series_animedb_id>7</series_animedb_id></anime>`));
    expect(r.ok && r.export.entries[0]?.title).toBe('#7');
  });

  it('refuse ce qui n’est pas un export MAL', () => {
    expect(parseMalXml('<html><body>bonjour</body></html>')).toEqual({
      ok: false,
      raison: 'This isn’t a MyAnimeList export.',
    });
    expect(parseMalXml('')).toMatchObject({ ok: false });
  });

  it('lit une liste entière, pas seulement la première entrée', () => {
    const trois = [21, 22, 23]
      .map((id) => `<anime><series_animedb_id>${id}</series_animedb_id></anime>`)
      .join('');
    const r = parseMalXml(anime(trois));
    expect(r.ok && r.export.entries.map((e) => e.malId)).toEqual([21, 22, 23]);
  });
});

describe('malDate', () => {
  it('convertit une date complète, à MIDI', () => {
    /* Minuit UTC se lit la veille à l'ouest : le journal afficherait un jour
       trop tôt. */
    expect(malDate('2019-04-01')).toBe('2019-04-01T12:00:00.000Z');
  });

  it('rejette les dates vides ou partielles de MAL', () => {
    for (const brut of ['0000-00-00', '2019-00-00', '2019-04-00', '', '   ', 'hier', null]) {
      expect(malDate(brut), String(brut)).toBeUndefined();
    }
  });
});

describe('les deux graphies de MyAnimeList', () => {
  /* Le defaut qui a fait echouer le premier import manga d'un VRAI fichier :
     MAL prefixe ses champs par `manga_` dans l'export manga et par `series_`
     dans l'export anime. Mon fixture manga avait ete fabrique par analogie
     avec l'anime, et les tests validaient donc ma supposition, pas le format.
     Ces cas-ci partent de la forme reelle. */

  it('lit un export manga au format REEL de MAL', () => {
    const xml = `<myanimelist>
      <myinfo><user_export_type>2</user_export_type></myinfo>
      <manga>
        <manga_mangadb_id>21</manga_mangadb_id>
        <manga_title><![CDATA[Death Note]]></manga_title>
        <manga_volumes>12</manga_volumes>
        <manga_chapters>108</manga_chapters>
        <my_read_volumes>12</my_read_volumes>
        <my_read_chapters>108</my_read_chapters>
        <my_score>9</my_score>
        <my_status>Completed</my_status>
        <my_times_read>1</my_times_read>
      </manga></myanimelist>`;
    const r = parseMalXml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.export.entries[0]).toMatchObject({
      malId: 21,
      title: 'Death Note',
      chapters: 108,
      volumes: 12,
      total: 108,
      score: 9,
      status: 'completed',
      rewatched: 1,
    });
  });

  it('accepte encore l’ancienne graphie `series_`', () => {
    // De vieux fichiers, ou passes par un outil tiers, la portent.
    const xml = `<myanimelist><myinfo><user_export_type>2</user_export_type></myinfo>
      <manga><series_mangadb_id>13</series_mangadb_id><series_title>One Piece</series_title>
      <series_chapters>1100</series_chapters></manga></myanimelist>`;
    const r = parseMalXml(xml);
    expect(r.ok && r.export.entries[0]).toMatchObject({
      malId: 13,
      title: 'One Piece',
      total: 1100,
    });
  });

  it('DIT quand le format ne se lit pas, au lieu d’annoncer une liste vide', () => {
    /* « Ce fichier ne contient aucune oeuvre » envoyait chercher le probleme
       du cote de l'utilisateur alors qu'il etait dans l'import. */
    const xml = `<myanimelist><myinfo><user_export_type>2</user_export_type></myinfo>
      <manga><identifiant_inconnu>21</identifiant_inconnu></manga>
      <manga><identifiant_inconnu>22</identifiant_inconnu></manga></myanimelist>`;
    const r = parseMalXml(xml);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.raison).toContain('2 manga');
    expect(r.raison).toContain('not one readable id');
  });

  it('reste une liste vide quand le fichier n’a vraiment aucun bloc', () => {
    const r = parseMalXml(
      '<myanimelist><myinfo><user_export_type>1</user_export_type></myinfo></myanimelist>',
    );
    expect(r.ok && r.export.entries).toEqual([]);
  });
});
