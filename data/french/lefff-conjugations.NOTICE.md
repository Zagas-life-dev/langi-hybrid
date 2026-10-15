# Attribution — French conjugation data

`lefff-conjugations.json` is a subset (≈73 common verbs) of the
**french-verbs-lefff** dataset, extracted for seeding Langi's grammar drills.

- **Source:** https://github.com/RosaeNLG/rosaenlg (package `french-verbs-lefff`)
- **Author:** Ludan Stoecklé (RosaeNLG)
- **Underlying data:** LEFFF (Lexique des Formes Fléchies du Français)
- **License:** Apache License 2.0

Tense keys in each verb entry follow the upstream encoding:
`P` présent · `I` imparfait · `F` futur simple · `C` conditionnel présent ·
`S` subjonctif présent · `Y` impératif · `K` participe passé
`[masc.sg, masc.pl, fem.sg, fem.pl]` · `G` participe présent · `W` infinitif.
Person order for the 6-element tenses is: je, tu, il/elle, nous, vous, ils/elles.

Conjugation forms are used verbatim from the dataset; the lesson explanations and
drill sentences around them are Langi's own.
