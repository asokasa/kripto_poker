# Mental Poker beadando

Ez a mappa egy futtathato Python megoldast tartalmaz a felev vegi Mental Poker beadandohoz.

## Futtatas

```powershell
python mental_poker.py
python mental_poker.py --test
```

Hasznos kapcsolok:

```powershell
python mental_poker.py --seed 42
python mental_poker.py --allow-folds
```

A program indulas utan bekeri a `p` primet, a ket jatekos nevet, majd a jatektipust. Ures Enter eseten az alapertelmezett `1000003`, `Alice`, `Bob` es `5 lapos poker` ertekeket hasznalja.

Mindket jatektipusnal a program minden fontos protokoll-lepes utan Enterre var. A jatekosok privat `x` ertekeit a program automatikusan, veletlenszeruen generalja ugy, hogy legyen modularis inverzuk mod `p-1`.

A `--allow-folds` kapcsolo Texas Holdem valasztasa eseten engedi, hogy valaki dobjon. Ilyenkor a program nem ir ki hole cardokat es nem nyitja meg a privat ertekeket.

## React TypeScript jatek

```powershell
npm install
npm run dev
npm run build
```

A React app az 5 lapos Mental Poker protokollt mutatja be lepesenkenti esemenyvezeto felulettel. A cserefazisban lehet valtani a ket jatekos kozott, es mindket kezen kezzel kijelolheto, mely lapok legyenek cserelve.

## Mi van implementalva?

- Alapfeladat: ketjatekos 5 lapos poker, kozos titkositott pakli, ket egymast koveto shuffle, sajat lapok ketlepeses revealje, opcion beallitott lapcsere, privat ertekek megnyitasa, nyertes meghatarozasa.
- Kiegeszites: ketjatekos Texas Holdem, kozos lapok publikus revealjevel, vegso licitkorrel. Privat ertekeket csak akkor ir ki, ha a vegso tetet megadtak.

## Vedesi megjegyzes

A feladatban szereplo nyers kartyaazonositok `d` ertekei teljesitik, hogy `p/2 < d < p-1`. Ezekhez a program `g^d mod p` publikus csoportelemeket rendel. A kozos pakliban ezek a csoportelemek szerepelnek.

Igy egy jatekos titkositasa `card^x mod p`. Ha a kartya eredetileg `g^d`, akkor ez pontosan `g^(x*d) mod p`, vagyis a feladatban kert forma. Tobb jatekos utan a retegek igy neznek ki:

```text
g^d -> (g^d)^x_A -> ((g^d)^x_A)^x_B = g^(d*x_A*x_B)
```

A reveal muvelet `card^y mod p`, ahol `x*y = 1 mod (p-1)`, ezert egy reteget visszabont:

```text
(g^(d*x_A*x_B))^y_B = g^(d*x_A)
(g^(d*x_A))^y_A = g^d
```

A vegso `g^d` ertek alapjan a program visszakeresi, melyik valodi kartya volt az.
