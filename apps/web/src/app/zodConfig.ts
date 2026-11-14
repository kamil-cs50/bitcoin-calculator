import { z } from 'zod';

// CSP bez 'unsafe-eval': zod bez JIT (inaczej jego próba `new Function` kończy się naruszeniem CSP w konsoli,
// choć wyjątek jest przechwytywany). Wczytywany jako pierwszy import w main.tsx, przed schematami.
z.config({ jitless: true });
