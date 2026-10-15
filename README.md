# Promocja 1500

Dziennik partii Rapid z chess.com. Aplikacja sama pobiera partie i ranking z chess.com, a do każdej partii można dopisać notatkę: dlaczego wygrana lub przegrana, co wyszło dobrze, nad czym pracować, otwarcie własne i przeciwnika. Pion na szachownicy pokazuje drogę do 1500.

Działa w przeglądarce na komputerze i na telefonie. Notatki są wspólne: wpis z telefonu widać na komputerze (odświeża się co mniej więcej minutę).

## Jak to działa

- **Partie i ranking** pochodzą z publicznego API chess.com. Nie trzeba się logować, wystarczy nick. Chess.com udostępnia partię dopiero po jej zakończeniu, czasem z opóźnieniem kilku minut (oficjalnie nawet do kilku godzin).
- **Notatki** zapisują się w pliku `data.json` w prywatnym repozytorium `szachy-1500-notatki`. Bez tokena GitHuba notatki zostają tylko na jednym urządzeniu.
- **Szybka notatka** (żółty przycisk) służy do pisania w trakcie partii. Przypina się sama do partii, która skończy się po jej zapisaniu, gdy tylko chess.com ją udostępni.

## Pierwsze uruchomienie (raz, robi rodzic)

### 1. Token do notatek

1. Wejdź na github.com → zdjęcie profilowe → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Nazwa: `Szachy notatki`. Ważność: najdłuższa dostępna (po wygaśnięciu trzeba wygenerować nowy i wpisać go w ustawieniach).
3. **Repository access** → **Only select repositories** → wybierz `szachy-1500-notatki`.
4. **Permissions** → **Repository permissions** → **Contents** → **Read and write**.
5. **Generate token** i skopiuj go (zaczyna się od `github_pat_`). GitHub pokaże go tylko raz.

Token daje dostęp wyłącznie do repozytorium z notatkami. Nie wysyłaj go nikomu.

### 2. Komputer syna

1. Otwórz adres aplikacji w Chrome lub Edge.
2. W oknie powitalnym wpisz nick z chess.com, a w sekcji synchronizacji wklej token. Właściciel i nazwa repo są już wpisane.
3. Kliknij **Zapisz**. W lewym panelu na dole powinno pojawić się „Notatki zsynchronizowane”.
4. Opcjonalnie: w Chrome/Edge menu ⋮ → **Zainstaluj aplikację**. Pojawi się ikona na pulpicie.

### 3. Telefon syna

1. Na komputerze: ikona zębatki → **Połącz telefon lub komputer**.
2. Zeskanuj kod aparatem telefonu i otwórz link. Aplikacja ustawi się sama.
3. Dodaj ją do ekranu głównego: iPhone (Safari) → Udostępnij → **Do ekranu początk.**, Android (Chrome) → ⋮ → **Dodaj do ekranu głównego**.

## Codzienne użycie (dla syna)

1. Grasz partię Rapid na komputerze. Jeśli coś ważnego się dzieje, na telefonie klikasz **Notatka** i piszesz kilka słów.
2. Po partii otwierasz ją na liście (pojawi się po kilku minutach, przycisk **Odśwież** pomaga) i uzupełniasz: dlaczego tak się skończyło, co było dobre, nad czym pracować, tagi.
3. W zakładce **Do poprawy** widzisz, które problemy powtarzają się najczęściej. W **Otwarciach** widzisz, jakie otwarcia dają Ci najlepsze wyniki.
4. W lewym panelu ustaw **Teraz skupiam się na**: jedna rzecz, którą ćwiczysz w najbliższych partiach.

## Zmiana ustawień

Nick, cel (domyślnie 1500), ranking startowy i token zmienisz pod ikoną zębatki. Domyślne wartości są też w pliku `config.js`.
