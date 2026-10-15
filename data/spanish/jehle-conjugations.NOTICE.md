# Attribution — Spanish conjugation data

`jehle-conjugations.json` is a subset (≈73 common verbs) of the **Fred Jehle
Spanish Verbs** database, extracted for seeding Langi's grammar drills by
`scripts/build-es-conjugations.mjs`.

- **Source:** https://github.com/ghidinelli/fred-jehle-spanish-verbs
- **Author:** Fred Jehle (compiled), repo maintained by Brian Ghidinelli
- **License:** Public domain (the author released the data into the public domain)

Each verb entry holds the tenses the lessons teach, person order
`[yo, tú, él/ella, nosotros, vosotros, ellos/ellas]`:

- `pres` presente de indicativo
- `pret` pretérito indefinido
- `imp` pretérito imperfecto
- `fut` futuro simple
- `cond` condicional simple
- `sub` presente de subjuntivo
- `ger` gerundio · `part` participio · `english` infinitive gloss

`haber` and `cantar` are absent from the upstream dataset and are supplied from
the standard RAE paradigm in the build script. Conjugation forms are used
verbatim; the lesson explanations and drills around them are Langi's own.
