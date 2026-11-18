# -*- coding: utf-8 -*-
"""
Script de génération du rapport d'architecture logicielle complet au format .docx
pour le projet AskMe Studio - 24 Sections exhaustives.
"""

import os
import sys
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=140, right=140):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="{top}" w:type="dxa"/><w:bottom w:w="{bottom}" w:type="dxa"/><w:left w:w="{left}" w:type="dxa"/><w:right w:w="{right}" w:type="dxa"/></w:tcMar>')
    tcPr.append(tcMar)

def add_styled_table(doc, headers, rows, col_widths=None):
    table = doc.add_table(rows=len(rows) + 1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False

    # Header row
    hdr_cells = table.rows[0].cells
    for i, title in enumerate(headers):
        hdr_cells[i].text = title
        set_cell_background(hdr_cells[i], "1F4E79")
        set_cell_margins(hdr_cells[i], top=120, bottom=120, left=140, right=140)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        for run in p.runs:
            run.font.bold = True
            run.font.color.rgb = RGBColor(255, 255, 255)
            run.font.size = Pt(9)
            run.font.name = "Calibri"

    # Data rows
    for r_idx, row_data in enumerate(rows):
        row_cells = table.rows[r_idx + 1].cells
        bg_color = "F2F5F9" if r_idx % 2 == 1 else "FFFFFF"
        for c_idx, val in enumerate(row_data):
            row_cells[c_idx].text = str(val)
            set_cell_background(row_cells[c_idx], bg_color)
            set_cell_margins(row_cells[c_idx], top=80, bottom=80, left=140, right=140)
            p = row_cells[c_idx].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            for run in p.runs:
                run.font.size = Pt(8.5)
                run.font.name = "Calibri"

    if col_widths:
        for row in table.rows:
            for i, w in enumerate(col_widths):
                row.cells[i].width = Inches(w)

    doc.add_paragraph()  # Spacing

def add_code_block(doc, code_text):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = tbl.cell(0, 0)
    set_cell_background(cell, "F4F5F7")
    set_cell_margins(cell, top=120, bottom=120, left=160, right=160)
    
    # Border
    tcPr = cell._tc.get_or_add_tcPr()
    borders = parse_xml(f'<w:tcBorders {nsdecls("w")}><w:left w:val="single" w:sz="24" w:space="0" w:color="2E75B6"/><w:top w:val="none"/><w:right w:val="none"/><w:bottom w:val="none"/></w:tcBorders>')
    tcPr.append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.15
    run = p.add_run(code_text.strip())
    run.font.name = "Consolas"
    run.font.size = Pt(8)
    run.font.color.rgb = RGBColor(30, 41, 59)
    doc.add_paragraph()

def build_docx(output_path):
    doc = Document()

    # Margins
    for s in doc.sections:
        s.top_margin = Inches(0.7)
        s.bottom_margin = Inches(0.7)
        s.left_margin = Inches(0.7)
        s.right_margin = Inches(0.7)

    # Document Header / Title
    title_p = doc.add_paragraph()
    title_p.paragraph_format.space_before = Pt(0)
    title_p.paragraph_format.space_after = Pt(4)
    run_title = title_p.add_run("AskMe Studio - Documentation d'Architecture Technique")
    run_title.font.name = "Calibri"
    run_title.font.size = Pt(24)
    run_title.font.bold = True
    run_title.font.color.rgb = RGBColor(31, 78, 121)

    sub_p = doc.add_paragraph()
    sub_p.paragraph_format.space_before = Pt(0)
    sub_p.paragraph_format.space_after = Pt(14)
    run_sub = sub_p.add_run("Dossier d'Architecture Système, Backend, Frontend, Microservices, Base de Données, Sécurité & IA")
    run_sub.font.name = "Calibri"
    run_sub.font.size = Pt(12)
    run_sub.font.italic = True
    run_sub.font.color.rgb = RGBColor(89, 89, 89)

    doc.add_paragraph("=" * 95)

    def h1(title):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(14)
        p.paragraph_format.space_after = Pt(4)
        run = p.add_run(title)
        run.font.name = "Calibri"
        run.font.size = Pt(15)
        run.font.bold = True
        run.font.color.rgb = RGBColor(31, 78, 121)
        return p

    def h2(title):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(10)
        p.paragraph_format.space_after = Pt(3)
        run = p.add_run(title)
        run.font.name = "Calibri"
        run.font.size = Pt(12)
        run.font.bold = True
        run.font.color.rgb = RGBColor(46, 117, 182)
        return p

    def p(text, bold_prefix=None):
        para = doc.add_paragraph()
        para.paragraph_format.space_before = Pt(2)
        para.paragraph_format.space_after = Pt(3)
        para.paragraph_format.line_spacing = 1.15
        if bold_prefix:
            r_pre = para.add_run(bold_prefix)
            r_pre.font.name = "Calibri"
            r_pre.font.size = Pt(9.5)
            r_pre.font.bold = True
        r_text = para.add_run(text)
        r_text.font.name = "Calibri"
        r_text.font.size = Pt(9.5)
        return para

    def bullet(text, bold_prefix=None):
        para = doc.add_paragraph(style='List Bullet')
        para.paragraph_format.space_before = Pt(1)
        para.paragraph_format.space_after = Pt(2)
        para.paragraph_format.line_spacing = 1.15
        if bold_prefix:
            r_pre = para.add_run(bold_prefix)
            r_pre.font.name = "Calibri"
            r_pre.font.size = Pt(9.5)
            r_pre.font.bold = True
        r_text = para.add_run(text)
        r_text.font.name = "Calibri"
        r_text.font.size = Pt(9.5)
        return para

    # 1. VUE D'ENSEMBLE DU PROJET
    h1("1. Vue d’ensemble du projet")
    bullet(" AskMe Studio (identifié dans package.json et README.md).", "Nom du projet :")
    bullet(" Copilote d'analyse décisionnelle (Business Intelligence) augmentée par Intelligence Artificielle. Plateforme complète permettant de connecter des sources de données relationnelles ou documentaires, d'en profiler le schéma, d'éditer une couche sémantique métier (tables, colonnes, KPIs calculés, synonymes), de convertir le langage naturel en requêtes SQL sécurisées (Text-to-SQL anti-hallucination), d'exécuter les requêtes en lecture seule et de restituer visualisations et résumés narratifs.", "Objectif fonctionnel :")
    bullet(" Application web fullstack SPA (Single Page Application) adossée à une API RESTful et des services NestJS dans un monorepo pnpm.", "Type d’application :")
    bullet(" Monolithe hybride centré sur l'API Gateway. Alors que la documentation théorique décrit 9 microservices, le code réel centralise 90% de la logique métier (Auth, RBAC, Text-to-SQL, AST Parser, Couche Sémantique, PgVector, exécution SQL, Redis) dans le service api-gateway (app.service.ts, 8072 lignes). Trois microservices périphériques sont effectivement sollicités par HTTP : metadata-service (3003), dashboard-service (3007) et datasource-service (3002). Les 6 autres services sont des stubs /health.", "Architecture générale constatée :")
    bullet(" TypeScript, Node.js (v20+), SQL PostgreSQL, HTML5, Sass.", "Technologies & Langages :")
    bullet(" NestJS 10.4.x, Express (Backend) | Vue 3.5.x, Vuetify 3.7.x, Pinia 2.3.x, Vue Router 4.4.x, Vite 5.4.x (Frontend).", "Frameworks :")
    bullet(" PostgreSQL 16 (avec extension pgvector pour les embeddings 384d) comme base pivot applicative | MongoDB 7 comme source de données cible analysée.", "Bases de données :")
    bullet(" Redis 7 Alpine (ioredis) pour la mémoire conversationnelle multi-tours (TTL 3600s) avec fallback en mémoire locale (Map).", "Système de cache :")
    bullet(" Non identifié dans le projet. Aucune file d'attente (Kafka, RabbitMQ, BullMQ). Communications interservices synchrones par HTTP fetch.", "Message Broker :")
    bullet(" API Gateway REST sur le port 8080 (/api/v1). Microservices sur ports 3001 à 3009. Aucun GraphQL ni WebSocket.", "APIs :")
    bullet(" Groq Cloud API (llama-3.1-8b-instant), OpenRouter API (openai/gpt-4o-mini), Ollama Local (qwen2.5-coder:7b).", "Services externes & IA :")
    bullet(" 13 conteneurs orchestrés avec Docker Compose sur le réseau askme-net.", "Conteneurisation :")

    h2("Tableau de synthèse de l'architecture")
    add_styled_table(
        doc,
        ["Élément", "Technologie", "Rôle", "Localisation dans le projet"],
        [
            ["Frontend SPA", "Vue 3, Vuetify 3, Pinia, Vite", "Interface utilisateur : Studio BI, chat IA, explorateur de schémas, dashboard builder", "frontend/"],
            ["API Gateway (Coeur)", "NestJS 10, pg, ioredis, bcrypt, jwt", "Point d'entrée HTTP unique, Auth, Text-to-SQL, sécurité SQL, sémantique, vecteur, proxy", "backend/api-gateway/"],
            ["Metadata Service", "NestJS 10, pg, mongodb", "Profilage technique des sources de données (tables, colonnes, types, statistiques)", "backend/services/metadata-service/"],
            ["Dashboard Service", "NestJS 10, pg (PostgreSQL)", "Persistance et gestion CRUD des dashboards et widgets analytiques", "backend/services/dashboard-service/"],
            ["Datasource Service", "NestJS 10, pg, mongodb, dns", "Validation réseau et test de connectivité aux bases de données cibles", "backend/services/datasource-service/"],
            ["AI Copilot Service", "NestJS 10", "Prototype d'analyse d'intention et politique anti-hallucination (non relié en prod)", "backend/services/ai-copilot-service/"],
            ["Stubs Microservices", "NestJS 10", "Services réservés au découpage futur (auth, semantic, query-executor, analytics, narrative)", "backend/services/"],
            ["Bibliothèque commune", "TypeScript", "Contrats types partagés (JwtPayload, ResponseEnvelope, AppError, Logger)", "backend/libs/common/"],
            ["Base & Vecteurs", "PostgreSQL 16 + pgvector", "Stockage utilisateurs, sources, couche sémantique, historique et index vectoriel 384d", "docker-compose (service postgres)"],
            ["Base NoSQL Cible", "MongoDB 7", "Base de données documentaire de démonstration pour le profilage de collections", "docker-compose (service mongodb)"],
            ["Mémoire & Cache", "Redis 7 Alpine", "Persistance du contexte conversationnel multi-tours et fenêtres de dialogue (TTL 3600s)", "docker-compose (service redis)"]
        ],
        [1.3, 1.6, 2.7, 1.4]
    )

    # 2. STRUCTURE DU PROJET
    h1("2. Structure du projet")
    p("L'arborescence complète s'articule autour d'un monorepo géré avec pnpm :")
    add_code_block(doc, """askme-studio-main/
├── backend/
│   ├── api-gateway/                      # Coeur applicatif (Port 8080 & app.service.ts de 8072 lignes)
│   ├── libs/common/                      # Contrats partagés (JwtPayload, Headers, Logging)
│   └── services/                         # Microservices (metadata, dashboard, datasource + stubs)
├── frontend/                             # Application SPA Vue 3 / Vite (Vuetify, AG Grid, Vue Flow, ApexCharts)
├── docs/                                 # Documentation théorique et schémas conceptuels
├── evals/                                # Benchmarks et cas d'évaluation sémantique offline
├── scripts/                              # Script d'évaluation automatique et seed SQL de test
└── docker-compose.yml                    # Définition des 13 conteneurs et volumes persistants""")

    # 3. ARCHITECTURE GLOBALE
    h1("3. Architecture globale")
    p("Le système repose sur une interaction exclusive entre le Frontend et l'API Gateway via HTTPS REST (Bearer JWT). L'API Gateway gère la logique de session conversationnelle dans Redis, la recherche sémantique vectorielle via pgvector, et l'inférence sécurisée Text-to-SQL avec Groq/OpenRouter.")
    add_code_block(doc, """flowchart TB
    Browser[Navigateur Web] --> Frontend[Frontend SPA (Vue 3 / Vite : 15173)]
    Frontend -- "HTTP REST (Bearer JWT)" --> Gateway[API Gateway (NestJS : 8080)]
    
    Gateway --> AuthCore[Auth & RBAC Module]
    Gateway --> SemanticEngine[Moteur Sémantique & RAG pgvector]
    Gateway --> SqlGuard[Validateur AST & Exécution Sécurisée]
    Gateway --> ConvEngine[Mémoire Conversationnelle]
    
    Gateway -- "HTTP POST (5s timeout)" --> SvcMeta[metadata-service : 3003]
    Gateway -- "HTTP REST (5s timeout)" --> SvcDash[dashboard-service : 3007]
    Gateway -- "HTTP POST (5s timeout)" --> SvcData[datasource-service : 3002]
    
    Gateway -- "TCP SQL Pool pg" --> Postgres[(PostgreSQL 16 + pgvector)]
    SvcDash -- "TCP SQL Pool pg" --> Postgres
    ConvEngine -- "TCP ioredis" --> Redis[(Redis 7 Cache)]
    
    SqlGuard -- "SELECT sécurisé lecture seule" --> TargetDB[(PostgreSQL Cible)]
    SqlGuard -- "HTTPS REST Completions" --> LLM[Groq / OpenRouter / Ollama]""")

    # 4. ARCHITECTURE BACKEND
    h1("4. Architecture Backend")
    p("Le backend utilise NestJS 10 avec le pilote natif pg sans ORM. Les requêtes SQL brutes sont écrites directement dans le code. L'authentification et les autorisations sont assurées par des méthodes d'assertion manuelles (requireAuthUser, assertRole).")
    add_styled_table(
        doc,
        ["Service", "Technologie", "Port", "Responsabilité", "DB", "Dépendances"],
        [
            ["api-gateway", "NestJS 10, TS", "8080", "Point d'entrée unique, Auth, Text-to-SQL, Sémantique, Exécution, Proxy", "Postgres, Redis, RAM", "pg, ioredis, bcrypt, jwt"],
            ["datasource-service", "NestJS 10, TS", "3002", "Test de connectivité des sources de données cibles", "Cibles temporaires", "pg, mongodb"],
            ["metadata-service", "NestJS 10, TS", "3003", "Profilage technique de schémas (tables, colonnes, statistiques)", "Cibles inspectées", "pg, mongodb"],
            ["dashboard-service", "NestJS 10, TS", "3007", "CRUD dashboards et widgets analytiques", "PostgreSQL (app_*)", "pg"],
            ["ai-copilot-service", "NestJS 10, TS", "3005", "Prototype d'analyse d'intention sémantique", "Aucune", "@nestjs/common"],
            ["auth-service", "NestJS 10, TS", "3001", "Squelette microservice (stub /health)", "Aucune", "@nestjs/common"],
            ["semantic-layer-service", "NestJS 10, TS", "3004", "Squelette microservice (stub /health)", "Aucune", "@nestjs/common"],
            ["query-executor-service", "NestJS 10, TS", "3006", "Squelette microservice (stub /health)", "Aucune", "@nestjs/common"],
            ["analytics-service", "NestJS 10, TS", "3008", "Squelette microservice (stub /health)", "Aucune", "@nestjs/common"],
            ["narrative-service", "NestJS 10, TS", "3009", "Squelette microservice (stub /health)", "Aucune", "@nestjs/common"]
        ],
        [1.3, 1.1, 0.6, 2.3, 1.1, 1.2]
    )

    # 5. FLUX BACKEND
    h1("5. Flux Backend")
    p("Le flux Text-to-SQL applique une double barrière : classification sémantique d'intention, puis analyse lexicale et syntaxique AST du SQL produit avant exécution.")
    add_code_block(doc, """sequenceDiagram
    Utilisateur ->> Frontend: Pose une question décisionnelle
    Frontend ->> Gateway: POST /api/v1/copilot/query/generate
    Gateway ->> Redis: Récupération historique session
    Gateway ->> PostgreSQL: RAG Vectoriel (embedding <=> vector)
    Gateway ->> LLM: Prompt contextuel borné
    LLM -->> Gateway: Requête SQL
    Gateway ->> Gateway: Validation AST (lecture seule, pas de subquery)
    Gateway -->> Frontend: Plan SQL validé
    Frontend ->> Gateway: POST /api/v1/copilot/query/execute
    Gateway ->> PostgreSQL Cible: Exécution SELECT borné (LIMIT 500)
    Gateway -->> Frontend: Données, Type de Graphe, Synthèse narrative""")

    # 6. API BACKEND
    h1("6. API Backend")
    p("Liste complète des routes et actions réelles identifiées dans les contrôleurs de l'API Gateway :")
    add_styled_table(
        doc,
        ["Méthode", "Endpoint", "Service", "Auth", "Fonction", "Description"],
        [
            ["GET", "/health", "Gateway", "Non", "health()", "État du service, de PostgreSQL et de pgvector"],
            ["POST", "/api/v1/auth/register", "Gateway", "Non", "register()", "Inscription d'un utilisateur"],
            ["POST", "/api/v1/auth/login", "Gateway", "Non", "login()", "Connexion et émission du jeton JWT"],
            ["GET", "/api/v1/auth/me", "Gateway", "Oui", "me()", "Profil et rôles de l'utilisateur connecté"],
            ["GET", "/api/v1/datasources", "Gateway", "Oui", "datasources()", "Liste des sources de données de l'utilisateur"],
            ["POST", "/api/v1/datasources", "Gateway", "Oui", "createDatasource()", "Ajout d'une source (chiffrement AES-256)"],
            ["POST", "/api/v1/datasources/test", "Gateway", "Oui", "testDatasource()", "Test de connexion (délégué à datasource-service)"],
            ["POST", "/api/v1/datasources/schemas", "Gateway", "Oui", "datasourceSchemas()", "Liste des schémas PostgreSQL disponibles"],
            ["GET", "/api/v1/datasets/:id/tables", "Gateway", "Oui", "datasetTables()", "Tables profilables (via metadata-service)"],
            ["GET", "/api/v1/datasets/:id/tables/:t/columns", "Gateway", "Oui", "datasetColumns()", "Colonnes et types (via metadata-service)"],
            ["GET", "/api/v1/datasets/:id/tables/:t/profile", "Gateway", "Oui", "datasetProfile()", "Statistiques de table (via metadata-service)"],
            ["GET", "/api/v1/datasets/:id/tables/:t/preview", "Gateway", "Oui", "datasetPreview()", "Aperçu des premières lignes d'une table"],
            ["GET", "/api/v1/semantic/:id", "Gateway", "Oui", "semantic()", "Récupération de la couche sémantique complète"],
            ["POST", "/api/v1/semantic/:id/generate", "Gateway", "Oui", "generateSemantic()", "Génération automatique heuristique"],
            ["POST", "/api/v1/semantic-layer/:id/generate-proposal", "Gateway", "Oui", "generateSemanticProposal()", "Proposition sémantique enrichie par IA"],
            ["POST", "/api/v1/semantic-layer/:id/save", "Gateway", "Oui", "saveSemanticLayer()", "Sauvegarde et indexation vectorielle"],
            ["POST", "/api/v1/copilot/query/generate", "Gateway", "Oui", "generate()", "Génération Text-to-SQL sécurisée"],
            ["POST", "/api/v1/copilot/query/execute", "Gateway", "Oui", "execute()", "Exécution du SQL et inférence graphique"],
            ["GET", "/api/v1/query/history", "Gateway", "Oui", "history()", "Historique des requêtes de l'utilisateur"],
            ["GET", "/api/v1/dashboards", "Gateway", "Oui", "dashboards()", "Liste des dashboards (via dashboard-service)"],
            ["POST", "/api/v1/dashboards", "Gateway", "Oui", "createDashboard()", "Création de dashboard (via dashboard-service)"],
            ["GET", "/api/v1/dashboards/:id", "Gateway", "Oui", "dashboard()", "Détail dashboard et widgets"],
            ["POST", "/api/v1/dashboards/:id/widgets", "Gateway", "Oui", "createWidget()", "Création de widget analytique"]
        ],
        [0.8, 2.2, 0.9, 0.5, 1.4, 2.0]
    )

    # 7. BASES DE DONNÉES
    h1("7. Bases de données")
    p("Le schéma relationnel est géré sur PostgreSQL 16. Les tables sont initialisées automatiquement au démarrage (sans ORM) avec des clés primaires texte préfixées :")
    bullet("app_users : id (usr_*), email, password_hash (bcrypt), role, created_at.")
    bullet("app_datasources : id (ds_*), user_id, name, type, encrypted_credentials (AES-256-GCM), connection_config.")
    bullet("app_semantic_tables : id (stbl_*), datasource_id, technical_name, business_name, description, table_type.")
    bullet("app_semantic_columns : id (scol_*), table_id, technical_name, business_name, semantic_type, data_type, is_nullable.")
    bullet("app_semantic_kpis : id (kpi_*), datasource_id, name, sql_formula, description, formatting.")
    bullet("app_semantic_synonyms : id (syn_*), datasource_id, term, mapped_value.")
    bullet("app_semantic_relationships : id (rel_*), datasource_id, from_table, to_table, join_type, cardinality, confidence.")
    bullet("app_semantic_search_entries : id (sve_*), entity_type, entity_id, content, metadata JSONB, embedding vector(384) avec index ivfflat cosinus.")
    bullet("app_query_history : id (qh_*), user_id, question, sql, created_at.")
    bullet("app_dashboards & app_dashboard_widgets : configurations et positions de widgets (gérées par dashboard-service).")

    # 8. ARCHITECTURE FRONTEND
    h1("8. Architecture Frontend")
    p("Le frontend est une SPA moderne bâtie avec Vue 3.5 et Vite 5 :")
    bullet("Vuetify 3.7 : Thème personnalisé AskMe clair/sombre, composants Material Design.")
    bullet("Pinia 2.3 : 7 stores (auth, copilot, dashboard, dataset, datasetExplorer, datasource, semantic).")
    bullet("Visualisations : ApexCharts 3.53 pour les graphiques, AG Grid pour les données tabulaires.")
    bullet("Modélisation : Vue Flow 1.42 pour la représentation sous forme de graphe relationnel.")
    bullet("Tableaux de bord : Vue Grid Layout 3 pour l'agencement drag & drop.")
    bullet("Client HTTP : Axios 1.7 configuré avec intercepteurs pour l'injection du jeton Bearer et la gestion des erreurs 401.")

    # 9. FLUX FRONTEND
    h1("9. Flux Frontend")
    p("Cycle des données : Action utilisateur -> Store Pinia -> Axios Client (injection token) -> API Gateway -> Réponse JSON -> Mutation du State Pinia -> Rendu réactif des composants graphiques.")

    # 10. ROUTING FRONTEND
    h1("10. Routing Frontend")
    add_styled_table(
        doc,
        ["Route", "Composant / Page", "Guard", "Authentification", "Rôle"],
        [
            ["/", "Redirection", "beforeEach", "Non", "Redirection vers /workspace"],
            ["/auth/login", "LoginView.vue", "beforeEach", "Publique", "Connexion utilisateur email/mot de passe et démo"],
            ["/auth/register", "RegisterView.vue", "beforeEach", "Publique", "Création de compte utilisateur"],
            ["/workspace", "WorkspaceView.vue", "beforeEach", "Privée", "Espace principal (Chat analytique + visualisations)"],
            ["/datasources", "DataSourcesView.vue", "beforeEach", "Privée", "Assistant de configuration et test des sources"],
            ["/datasets/:s/:d?", "DatasetExplorerView.vue", "beforeEach", "Privée", "Explorateur de schémas, graphe et aperçus tabulaires"],
            ["/semantic/:sourceId", "SemanticLayerView.vue", "beforeEach", "Privée", "Éditeur de la couche sémantique métier"],
            ["/dashboards", "DashboardManagerView.vue", "beforeEach", "Privée", "Administration des tableaux de bord"],
            ["/dashboards/:id/edit", "DashboardBuilderView.vue", "beforeEach", "Privée", "Studio d'édition visuelle en grille (drag & drop)"],
            ["/dashboards/:id/view", "DashboardViewerView.vue", "beforeEach", "Privée", "Affichage plein écran lecture seule de dashboard"],
            ["/playground", "QueryPlaygroundView.vue", "beforeEach", "Privée", "Bac à sable de requêtes et test de prompts"]
        ],
        [1.5, 1.8, 1.0, 1.2, 2.5]
    )

    # 11. AUTHENTIFICATION ET SÉCURITÉ
    h1("11. Authentification et sécurité")
    bullet("JWT HMAC-SHA256 (15 min), stocké dans le localStorage sous 'askme_access_token'.", "Gestion des jetons :")
    bullet("Rôles Admin, Analyst, Viewer vérifiés programmatiquement par assertRole().", "RBAC :")
    bullet("bcryptjs avec salage à 10 tours.", "Mots de passe :")
    bullet("AES-256-GCM avec clé dérivée SHA-256 depuis DATASOURCE_SECRET.", "Chiffrement des sources :")
    bullet("Analyseur lexical AST maison : rejet des écritures, commentaires (-- et /*), requêtes multiples, sous-requêtes, et SELECT *. Validation stricte des tables et colonnes dans la couche sémantique. LIMIT 500 et timeout SQL 30s.", "Sécurité SQL :")

    # 12. COMMUNICATION ENTRE SERVICES
    h1("12. Communication entre services")
    p("Toutes les communications interservices sont synchrones par HTTP/1.1 REST en JSON. L'API Gateway appelle metadata-service (3003), dashboard-service (3007) et datasource-service (3002) avec un timeout de 5s et repli local en mémoire en cas d'erreur. Aucun message broker (Kafka/RabbitMQ) n'est présent.")

    # 13. DOCKER ET INFRASTRUCTURE
    h1("13. Docker et infrastructure")
    p("13 conteneurs orchestrés par Docker Compose sur le réseau askme-net : frontend (15173), api-gateway (8080), microservices (3001 à 3009), postgres (15432, image pgvector), mongodb (17017) et redis (63179). Volumes persistants : postgres-data, mongodb-data, redis_data.")

    # 14. CONFIGURATION
    h1("14. Configuration")
    bullet("JWT_SECRET, JWT_EXPIRES_IN (15m), DATASOURCE_SECRET (AES-256-GCM).", "Sécurité :")
    bullet("POSTGRES_URL, MONGODB_URL, REDIS_URL / REDIS_HOST / REDIS_PORT (63179), CONVERSATION_MEMORY_TTL_SECONDS (3600).", "Infrastructure :")
    bullet("GROQ_API_KEY, GROQ_MODEL (llama-3.1-8b-instant), OPENROUTER_API_KEY, OPENROUTER_MODEL, OLLAMA_BASE_URL (http://host.docker.internal:11434).", "IA LLM :")
    bullet("SEMANTIC_SEARCH_TOP_K (10), SEMANTIC_SEARCH_MMR (0.4), QUERY_TIMEOUT_MS (30000), QUERY_MAX_ROWS (500).", "RAG & Limites :")
    bullet("VITE_API_BASE_URL (repli 'http://127.0.0.2:8080/api/v1').", "Frontend :")

    # 15. OBSERVABILITÉ
    h1("15. Observabilité")
    bullet("Sorties consoles standard (console.log, console.error).", "Logs :")
    bullet("Non identifié dans le projet (pas d'ELK, Loki, Prometheus, Grafana, OpenTelemetry).", "Monitoring & Tracing :")
    bullet("Route /health sur chaque service (l'API Gateway indique l'état de Postgres et de pgvector).", "Health Checks :")
    bullet("Historisation minimale des requêtes exécutées dans app_query_history.", "Audit :")

    # 16. DÉPENDANCES
    h1("16. Dépendances")
    add_styled_table(
        doc,
        ["Catégorie", "Composants Backend", "Composants Frontend"],
        [
            ["Framework", "@nestjs/common, @nestjs/core, @nestjs/platform-express", "vue 3.5, vue-router 4.4, pinia 2.3"],
            ["Database & Cache", "pg 8.13, ioredis 5.11, mongodb 6.8", "N/A"],
            ["Sécurité", "bcryptjs 2.4, jsonwebtoken 9.0, crypto", "N/A (Gestion client JWT via localStorage)"],
            ["UI & Visualisation", "N/A", "vuetify 3.7, apexcharts 3.53, ag-grid-vue3 32.3, @vue-flow/core 1.42"],
            ["API / Client HTTP", "fetch natif Node.js", "axios 1.7"],
            ["Build & Tooling", "typescript 5.6, pnpm 9.12", "vite 5.4, sass 1.79, @vitejs/plugin-vue 5.1"]
        ],
        [1.8, 3.0, 3.0]
    )

    # 17. TESTS
    h1("17. Tests")
    bullet("Non identifié dans le projet. Dossiers test/ contenant uniquement .gitkeep. Pas de spec.ts.", "Tests unitaires :")
    bullet("Non identifié. Script frontend : echo 'frontend tests not configured yet'.", "Tests d'intégration & E2E :")
    bullet("Script scripts/run-api-gateway-evals.cjs validant offline les scénarios sémantiques et de Text-to-SQL avec evals/api-gateway-semantic.json.", "Évaluations IA :")
    bullet("Script scripts/seed-postgres-test.sql générant 1448 lignes de test dans public.orders.", "Seeding :")

    # 18. ARCHITECTURE LOGIQUE
    h1("18. Architecture logique")
    p("L'architecture logique s'organise en couches : Présentation (SPA Vue 3) -> Application (Gateway, RBAC, Sessions) -> Métier (Moteur sémantique, Text-to-SQL, Validateur AST) -> Infrastructure (Clients pg, ioredis, crypto, fetch) -> Données (PostgreSQL, pgvector, Redis, sources cibles).")

    # 19. DIAGRAMME GLOBAL FINAL
    h1("19. Diagramme global final")
    add_code_block(doc, """flowchart TB
    User[Utilisateur] --> Frontend[Frontend Vue 3 (Vuetify / ApexCharts / AG Grid)]
    Frontend -- "Bearer JWT" --> Gateway[API Gateway NestJS (8080)]
    
    Gateway --> AppService[AppService Monolithe (8072 lignes)]
    AppService --> ASTValidator[Validateur AST SQL]
    AppService --> Crypto[Crypto AES-256-GCM]
    AppService --> Conv[Conversation Memory]
    
    AppService -- "HTTP" --> SvcMeta[metadata-service : 3003]
    AppService -- "HTTP" --> SvcDash[dashboard-service : 3007]
    AppService -- "HTTP" --> SvcData[datasource-service : 3002]
    
    AppService --> PostgresApp[(PostgreSQL 16 + pgvector)]
    AppService --> RedisCache[(Redis 7 Cache)]
    AppService -- "Prompt" --> LLM[Groq / OpenRouter / Ollama]
    AppService -- "SELECT" --> TargetDB[(PostgreSQL Cible)]""")

    # 20. MATRICE DES COMMUNICATIONS
    h1("20. Matrice des communications")
    add_styled_table(
        doc,
        ["Source", "Destination", "Protocole", "Endpoint / Canal", "Type", "Objectif"],
        [
            ["Frontend", "API Gateway", "HTTP", "/api/v1/auth/login", "JSON", "Connexion utilisateur"],
            ["Frontend", "API Gateway", "HTTP", "/api/v1/copilot/query/generate", "JSON", "Génération Text-to-SQL"],
            ["Frontend", "API Gateway", "HTTP", "/api/v1/copilot/query/execute", "JSON", "Exécution SQL sécurisée"],
            ["Frontend", "API Gateway", "HTTP", "/api/v1/dashboards/*", "JSON", "CRUD tableaux de bord"],
            ["API Gateway", "metadata-service", "HTTP", "POST /profile/*", "JSON", "Profilage schémas et aperçus"],
            ["API Gateway", "dashboard-service", "HTTP", "REST /dashboards/*", "JSON", "CRUD dashboards et widgets"],
            ["API Gateway", "datasource-service", "HTTP", "POST /connections/test", "JSON", "Validation réseau de sources"],
            ["API Gateway", "PostgreSQL", "TCP", "Port 5432 (pg pool)", "SQL", "Persistance app_* et pgvector"],
            ["API Gateway", "Redis", "TCP", "Port 63179 (ioredis)", "JSON", "Mémoire conversationnelle"],
            ["API Gateway", "Groq / OpenRouter", "HTTPS", "/chat/completions", "JSON", "Inférence LLM Text-to-SQL"],
            ["API Gateway", "PostgreSQL Cible", "TCP", "Port dynamique (pg)", "SQL", "Exécution décisionnelle bornée"]
        ],
        [1.1, 1.3, 0.6, 1.8, 0.7, 2.3]
    )

    # 21. MATRICE DES RESPONSABILITÉS
    h1("21. Matrice des responsabilités")
    add_styled_table(
        doc,
        ["Composant", "Responsabilité principale", "Dépendances", "Consommateurs"],
        [
            ["Frontend SPA", "Interface utilisateur, visualisations, chat décisionnel", "Vuetify, Pinia, Axios, ApexCharts, AG Grid", "Utilisateurs finaux"],
            ["API Gateway", "Orchestrateur central, Auth, Text-to-SQL, Sécurité SQL, RAG", "PostgreSQL, Redis, Groq/OpenRouter, services internes", "Frontend SPA"],
            ["Metadata Service", "Inspection technique des tables, colonnes et statistiques", "PostgreSQL, MongoDB", "API Gateway"],
            ["Dashboard Service", "Persistance et gestion des tableaux de bord et widgets", "PostgreSQL (app_dashboards, app_dashboard_widgets)", "API Gateway"],
            ["Datasource Service", "Test réseau et validation des identifiants des sources", "Pilotes pg, mongodb, DNS", "API Gateway"],
            ["PostgreSQL 16", "Persistance relationnelle et indexation vectorielle 384d", "pgvector (ivfflat cosinus)", "API Gateway, Dashboard Service"],
            ["Redis 7", "Cache mémoire des sessions et contextes de dialogue (TTL 3600s)", "Moteur Redis Alpine", "API Gateway"]
        ],
        [1.5, 2.7, 2.1, 1.5]
    )

    # 22. POINTS D'ATTENTION TECHNIQUES
    h1("22. Points d’attention techniques (Audit Senior)")
    bullet("backend/api-gateway/src/app.service.ts (8072 lignes et 312 Ko concentrant toute la logique métier). Risque critique de régression. Solution : découper en services spécialisés (Auth, Semantic, SqlGuard, Copilot).", "1. God Service centralisé :")
    bullet("docker-compose.yml et 6 microservices stubs (auth, semantic, query-executor, analytics, narrative). Consommation de ~600 Mo de RAM inutile pour de simples /health. Solution : élaguer les conteneurs du compose.", "2. Décalage microservices vs monolithe :")
    bullet("JWT_SECRET et DATASOURCE_SECRET avec repli par défaut sur 'change-me'. Faille critique permettant de forger des jetons Admin et déchiffrer les accès bases. Solution : refuser le démarrage si le secret est absent ou égal à 'change-me'.", "3. Clé de sécurité par défaut :")
    bullet("frontend/src/services/api/client.ts utilise l'adresse de repli 'http://127.0.0.2:8080/api/v1'. Risque de blocage réseau selon les OS. Solution : utiliser localhost ou proxy relatif.", "4. IP atypique hardcodée :")
    bullet("Dossiers test/ vides avec .gitkeep et script frontend avec echo. Zéro test unitaire ou d'intégration. Solution : mettre en place Jest et Vitest.", "5. Absence de tests automatisés :")
    bullet("app.service.ts ligne 5068 renvoie 'Execution is not yet available for datasource type ${context.type}' pour MongoDB et CSV. Seul PostgreSQL est exécutable en direct.", "6. Exécution non relationnelle non disponible :")

    # 23. RECOMMANDATIONS D'ARCHITECTURE
    h1("23. Recommandations d’architecture")
    add_styled_table(
        doc,
        ["Priorité", "Recommandation", "Problème", "Bénéfice", "Effort"],
        [
            ["Haute", "Refactoriser app.service.ts", "Monolithe de 8072 lignes", "Maintenabilité et testabilité unitaire", "3-4 j/h"],
            ["Haute", "Bloquer les secrets 'change-me'", "Vulnérabilité critique de sécurité", "Élimination des failles d'accès", "0.5 j/h"],
            ["Haute", "Élaguer les conteneurs inactifs", "6 stubs consommant ~600 Mo RAM", "Garantit le run sur laptop 8 Go RAM", "0.5 j/h"],
            ["Moyenne", "Mettre en place des tests automatisés", "0 test unitaire ou d'intégration", "Sécurise les évolutions et le validateur SQL", "3 j/h"],
            ["Moyenne", "Harmoniser l'URL API Frontend", "127.0.0.2 hardcodé", "Portabilité réseau multi-OS", "0.5 j/h"],
            ["Basse", "Implémenter un Refresh Token", "Déconnexion après 15 min", "Meilleure ergonomie utilisateur", "2 j/h"],
            ["Basse", "Générer la doc Swagger/OpenAPI", "Pas de documentation interactive", "Documentation toujours synchronisée au code", "1.5 j/h"]
        ],
        [0.8, 2.0, 1.8, 2.0, 0.7]
    )

    # 24. DOCUMENTATION FINALE
    h1("24. Documentation finale")
    p("AskMe Studio est une plateforme de BI conversationnelle fonctionnelle dotée d'une barrière de sécurité SQL robuste (validateur AST maison) et d'un RAG vectoriel sans dépendance Python externe (pgvector 384d). La priorité d'ingénierie logicielle pour franchir le cap de la mise en production concerne le découpage du service central app.service.ts, l'officialisation de son architecture en monolithe modulaire épuré, la sécurisation des secrets cryptographiques et l'automatisation des tests.")

    # Save document
    doc.save(output_path)
    print(f"Document saved successfully to: {output_path}")

if __name__ == '__main__':
    out = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "AskMe_Studio_Architecture_Logicielle.docx")
    build_docx(out)
