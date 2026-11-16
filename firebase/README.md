# firebase/

Firebase configuration that is code: `firebase.json`, the Firestore and Storage security rules, the rules tests, and
`SCHEMA.md` for the stored format (SDD 5.1, RC-01, RC-02, RC-20).

Belongs here: anything deployed to or tested against Firebase. Rules start from deny-all and allow only the owner
(ARCHITECTURE.md rule A6).

Does not belong here: service-account keys, `GoogleService-Info.plist`, `.env` files or emulator data (RC-06, rule A7).
These are ignored by `.gitignore`.

Empty until P0-04 adds the emulator setup and the deny-by-default rules.
