# MyN Fitness

Plataforma de administración y gestión fitness — React + TypeScript + Supabase + Netlify.

- Arquitectura, modelo de datos, permisos y plan: [docs/01-arquitectura-etapa1.md](docs/01-arquitectura-etapa1.md)
- Avance y criterios de aceptación: [docs/02-avance.md](docs/02-avance.md)
- Despliegue: [docs/03-despliegue.md](docs/03-despliegue.md)

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # completar con los datos del proyecto Supabase
npm run dev                  # http://localhost:5173
```

## Pruebas

```bash
npm test          # unitarias (formato PYG, fechas en America/Asuncion)
npm run test:db   # migraciones + RLS/RPC contra PostgreSQL en memoria (PGlite, sin Docker)
npm run lint
npm run build
```

## Estructura

```
docs/                 documentación
supabase/migrations/  SQL versionado (nunca editar una migración ya aplicada: crear una nueva)
supabase/functions/   Edge Functions (secretos sólo aquí)
supabase/tests/       pruebas de base de datos y permisos
src/app/              router, guards, layout, navegación por rol
src/components/       componentes UI reutilizables
src/features/<mod>/   módulos funcionales
src/lib/              cliente Supabase, formatos, errores
```
