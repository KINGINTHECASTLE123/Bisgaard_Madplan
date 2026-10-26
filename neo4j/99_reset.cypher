// Sletter ALLE data, men beholder constraints og indexes.
// Brug når du vil køre ingestion forfra. (Datasættet er lille, så én transaktion er fint.)
MATCH (n) DETACH DELETE n;
