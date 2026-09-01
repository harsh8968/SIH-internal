Explore the frontend of this project fully before proposing anything.

Read `crackx-app/App.tsx` (the whole navigation lives there as a switch on an
`AppState` union — no React Navigation), `crackx-app/src/constants/index.ts`
(the `COLORS` object is the current design system), `crackx-app/src/types/index.ts`
(the real domain model), `crackx-app/src/components/` (DashboardLayout + Sidebar
are the shared shell), all 21 files in `crackx-app/src/screens/`, and
`crackx-app/src/i18n/en.ts`.

It's React Native + Expo + TypeScript with `StyleSheet.create`, shipping to
Android and to web via react-native-web. No Tailwind, no CSS, no new UI library.
Four languages (English, Hindi, Marathi, Kannada). Five roles: citizen, RSO,
contractor, compliance officer, admin. It's civic-tech for an Indian municipal
corporation — a citizen reports a pothole, AI grades its severity, an officer
assigns a contractor, the repair gets verified.

Then propose **3 genuinely different design directions** for the frontend —
different points of view, not one idea recolored. For each: the visual language
(type, color tokens, spacing, radii, elevation), how severity and report status
read at a glance, and mockups of Citizen Home, RSO Home, and Report Damage at
phone and desktop width.

Stop there. I'll pick one before you build anything.
