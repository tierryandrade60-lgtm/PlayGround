# Áudio do jogo

Estrutura:

- `shared/`: impactos, UI, erro, ataque básico e destruição.
- `ironman/`: repulsor, mísseis, explosões, feixes, lasers, propulsores e Unibeam.
- `agatha/`: magia, drenagem sombria, teleporte, voo arcano, garrote e orbe do caos.

O registo central de efeitos, ganhos, limites de vozes e loops está em
`src/game/audio/AudioManifest.ts`. O motor de reprodução está em
`src/game/AudioSystem.ts`.

Os loops são WAV para evitar o gap de encoder de MP3; os one-shots são MP3.
As licenças e atribuições estão em `LICENSES.md`.
