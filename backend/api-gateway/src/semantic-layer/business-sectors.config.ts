import type { SemanticBusinessSector, SemanticKpiFormatting } from './semantic.types';

export interface BusinessMetricAlias {
  keywords: string[];
  totalName: string;
  averageName: string;
  totalDescription: string;
  averageDescription: string;
  formatting?: SemanticKpiFormatting;
  synonyms: string[];
}

export interface BusinessSectorProfile {
  code: SemanticBusinessSector;
  label: string;
  description: string;
  metricAliases: BusinessMetricAlias[];
  synonyms: Record<string, string[]>;
}

export const BUSINESS_SECTOR_PROFILES: Record<SemanticBusinessSector, BusinessSectorProfile> = {
  sales_distribution: {
    code: 'sales_distribution',
    label: 'Ventes / Commerce / Distribution',
    description: 'Performance commerciale, rentabilite, stock, campagnes, clients, commerciaux et zones.',
    metricAliases: [
      {
        keywords: ['amount', 'total', 'revenue', 'sales', 'price', 'montant', 'ca'],
        totalName: "Chiffre d'affaires",
        averageName: 'Panier moyen',
        totalDescription: 'Montant total des ventes realisees sur le perimetre analyse.',
        averageDescription: 'Montant moyen par commande, transaction ou vente.',
        formatting: 'currency',
        synonyms: ["chiffre d'affaires", 'ca', 'ventes', 'revenu', 'montant des ventes', 'panier moyen']
      },
      {
        keywords: ['margin', 'profit', 'marge'],
        totalName: 'Marge commerciale',
        averageName: 'Marge moyenne',
        totalDescription: 'Marge totale generee par les ventes.',
        averageDescription: 'Marge moyenne par transaction ou ligne commerciale.',
        formatting: 'currency',
        synonyms: ['marge', 'profit', 'rentabilite', 'marge commerciale']
      },
      {
        keywords: ['quantity', 'qty', 'volume'],
        totalName: 'Volume vendu',
        averageName: 'Quantite moyenne vendue',
        totalDescription: 'Quantite totale de produits vendus.',
        averageDescription: 'Quantite moyenne vendue par transaction.',
        formatting: 'number',
        synonyms: ['volume', 'quantite vendue', 'articles vendus', 'unites vendues']
      }
    ],
    synonyms: {
      customer: ['client', 'acheteur', 'compte client', 'consommateur'],
      product: ['produit', 'article', 'sku', 'reference'],
      campaign: ['campagne', 'promotion', 'operation marketing'],
      stock: ['stock', 'inventaire', 'disponibilite', 'rupture'],
      sales_rep: ['commercial', 'vendeur', 'conseiller commercial'],
      region: ['region', 'zone', 'territoire', 'ville', 'marche marocain']
    }
  },
  finance_accounting: {
    code: 'finance_accounting',
    label: 'Finance / Comptabilite / Controle de gestion',
    description: 'Analyse financiere, charges, budgets, tresorerie, paiements et ecarts.',
    metricAliases: [
      {
        keywords: ['amount', 'total', 'balance', 'revenue'],
        totalName: 'Montant comptable',
        averageName: 'Montant moyen',
        totalDescription: 'Somme des montants comptables sur le perimetre analyse.',
        averageDescription: 'Montant moyen par ecriture, facture ou operation.',
        formatting: 'currency',
        synonyms: ['montant', 'solde', 'valeur comptable', 'flux financier']
      },
      {
        keywords: ['cost', 'charge', 'expense'],
        totalName: 'Charges totales',
        averageName: 'Charge moyenne',
        totalDescription: 'Total des charges constatees.',
        averageDescription: 'Charge moyenne par operation ou centre analytique.',
        formatting: 'currency',
        synonyms: ['charges', 'depenses', 'couts', 'opex']
      }
    ],
    synonyms: {
      invoice: ['facture', 'piece comptable', 'document comptable'],
      payment: ['paiement', 'reglement', 'encaissement', 'decaissement'],
      budget: ['budget', 'prevision', 'enveloppe'],
      account: ['compte', 'compte comptable', 'rubrique'],
      department: ['centre de cout', 'centre analytique', 'service']
    }
  },
  human_resources: {
    code: 'human_resources',
    label: 'Ressources humaines',
    description: 'Effectifs, masse salariale, absentisme, turnover, recrutement et formation.',
    metricAliases: [
      {
        keywords: ['amount', 'salary', 'wage', 'payroll', 'cost'],
        totalName: 'Masse salariale',
        averageName: 'Salaire moyen',
        totalDescription: 'Total des salaires, primes ou couts RH sur la periode.',
        averageDescription: 'Remuneration moyenne par employe ou contrat.',
        formatting: 'currency',
        synonyms: ['masse salariale', 'salaire', 'paie', 'remuneration', 'cout RH']
      },
      {
        keywords: ['duration', 'absence', 'hours', 'days'],
        totalName: "Volume d'absence",
        averageName: "Absence moyenne",
        totalDescription: "Total des heures ou jours d'absence.",
        averageDescription: "Absence moyenne par employe.",
        formatting: 'number',
        synonyms: ['absence', 'absenteisme', 'jours absents', 'heures absentes']
      }
    ],
    synonyms: {
      employee: ['employe', 'collaborateur', 'salarie', 'ressource'],
      department: ['departement', 'service', 'direction', 'entite'],
      position: ['poste', 'fonction', 'emploi'],
      training: ['formation', 'apprentissage', 'certification'],
      recruitment: ['recrutement', 'embauche', 'candidature']
    }
  },
  logistics_supply_chain: {
    code: 'logistics_supply_chain',
    label: 'Logistique / Transport / Supply Chain',
    description: 'Livraisons, couts logistiques, delais, entrepots, transporteurs, stock et ruptures.',
    metricAliases: [
      {
        keywords: ['amount', 'cost', 'price', 'freight', 'shipping'],
        totalName: 'Cout logistique',
        averageName: 'Cout moyen de livraison',
        totalDescription: 'Cout total du transport, stockage ou traitement logistique.',
        averageDescription: 'Cout logistique moyen par expedition ou livraison.',
        formatting: 'currency',
        synonyms: ['cout logistique', 'frais de livraison', 'transport', 'fret']
      },
      {
        keywords: ['duration', 'delay', 'lead_time', 'time'],
        totalName: 'Delai cumule',
        averageName: 'Delai moyen de livraison',
        totalDescription: 'Somme des delais observes sur les flux logistiques.',
        averageDescription: 'Delai moyen entre commande, expedition et livraison.',
        formatting: 'number',
        synonyms: ['delai', 'retard', 'lead time', 'temps de livraison']
      }
    ],
    synonyms: {
      shipment: ['expedition', 'livraison', 'envoi'],
      carrier: ['transporteur', 'prestataire transport'],
      warehouse: ['entrepot', 'depot', 'plateforme'],
      stock: ['stock', 'inventaire', 'rupture', 'reapprovisionnement'],
      supplier: ['fournisseur', 'approvisionneur', 'vendor']
    }
  },
  manufacturing_production: {
    code: 'manufacturing_production',
    label: 'Production / Industrie / Manufacturing',
    description: 'Production, rendement, qualite, rebuts, arrets machines, capacite et couts.',
    metricAliases: [
      {
        keywords: ['quantity', 'qty', 'volume', 'units'],
        totalName: 'Volume produit',
        averageName: 'Production moyenne',
        totalDescription: 'Quantite totale produite sur le perimetre analyse.',
        averageDescription: 'Volume moyen produit par ordre, lot ou periode.',
        formatting: 'number',
        synonyms: ['production', 'volume produit', 'unites produites', 'rendement']
      },
      {
        keywords: ['cost', 'amount', 'price'],
        totalName: 'Cout de production',
        averageName: 'Cout unitaire moyen',
        totalDescription: 'Cout total de fabrication.',
        averageDescription: 'Cout moyen par unite, lot ou ordre de production.',
        formatting: 'currency',
        synonyms: ['cout de production', 'cout fabrication', 'cout industriel']
      }
    ],
    synonyms: {
      machine: ['machine', 'ligne', 'equipement'],
      batch: ['lot', 'serie', 'ordre de production'],
      quality: ['qualite', 'controle qualite', 'defaut', 'rebut'],
      plant: ['usine', 'atelier', 'site de production']
    }
  },
  marketing_crm: {
    code: 'marketing_crm',
    label: 'Marketing / CRM / Relation client',
    description: 'Campagnes, leads, conversions, segmentation, satisfaction, fidelisation et ROI.',
    metricAliases: [
      {
        keywords: ['amount', 'revenue', 'sales'],
        totalName: 'Revenu campagne',
        averageName: 'Revenu moyen par client',
        totalDescription: 'Revenu total attribue aux campagnes ou actions CRM.',
        averageDescription: 'Revenu moyen genere par client, lead ou conversion.',
        formatting: 'currency',
        synonyms: ['revenu campagne', 'roi', 'retour marketing', 'valeur client']
      },
      {
        keywords: ['score', 'rating', 'satisfaction', 'nps'],
        totalName: 'Score de satisfaction cumule',
        averageName: 'Satisfaction moyenne',
        totalDescription: 'Somme des scores de satisfaction collectes.',
        averageDescription: 'Score moyen de satisfaction client.',
        formatting: 'number',
        synonyms: ['satisfaction', 'nps', 'avis client', 'experience client']
      }
    ],
    synonyms: {
      campaign: ['campagne', 'action marketing', 'operation'],
      lead: ['lead', 'prospect', 'opportunite'],
      customer: ['client', 'contact', 'compte CRM'],
      channel: ['canal', 'source', 'levier marketing'],
      conversion: ['conversion', 'transformation', 'acquisition']
    }
  },
  healthcare: {
    code: 'healthcare',
    label: 'Sante / Cliniques / Hopitaux',
    description: 'Patients, consultations, actes, medecins, occupation, delais et qualite de service.',
    metricAliases: [
      {
        keywords: ['amount', 'price', 'cost', 'revenue'],
        totalName: 'Montant des actes',
        averageName: 'Cout moyen par patient',
        totalDescription: 'Montant total des consultations, actes ou prises en charge.',
        averageDescription: 'Montant moyen par patient, consultation ou sejour.',
        formatting: 'currency',
        synonyms: ['actes', 'honoraires', 'cout patient', 'recette medicale']
      },
      {
        keywords: ['duration', 'delay', 'waiting', 'time'],
        totalName: 'Temps cumule de prise en charge',
        averageName: "Delai moyen d'attente",
        totalDescription: 'Temps total observe pour les prises en charge.',
        averageDescription: "Delai moyen d'attente ou de prise en charge.",
        formatting: 'number',
        synonyms: ['delai attente', 'temps prise en charge', 'attente patient']
      }
    ],
    synonyms: {
      patient: ['patient', 'beneficiaire', 'assure'],
      doctor: ['medecin', 'praticien', 'specialiste'],
      department: ['service', 'unite', 'pole medical'],
      appointment: ['consultation', 'rendez-vous', 'visite'],
      diagnosis: ['diagnostic', 'pathologie', 'motif']
    }
  },
  education_training: {
    code: 'education_training',
    label: 'Education / Formation',
    description: 'Etudiants, inscriptions, presences, resultats, formations, enseignants et abandon.',
    metricAliases: [
      {
        keywords: ['amount', 'fee', 'cost', 'price'],
        totalName: "Frais d'inscription",
        averageName: 'Frais moyen par apprenant',
        totalDescription: "Total des frais d'inscription ou de formation.",
        averageDescription: 'Montant moyen par etudiant, apprenant ou inscription.',
        formatting: 'currency',
        synonyms: ['frais', 'inscription', 'cout formation', 'scolarite']
      },
      {
        keywords: ['score', 'grade', 'mark', 'rating'],
        totalName: 'Score total',
        averageName: 'Note moyenne',
        totalDescription: 'Somme des notes ou scores pedagogiques.',
        averageDescription: 'Note moyenne des apprenants.',
        formatting: 'number',
        synonyms: ['note', 'score', 'resultat', 'performance pedagogique']
      }
    ],
    synonyms: {
      student: ['etudiant', 'apprenant', 'eleve'],
      course: ['cours', 'module', 'formation'],
      teacher: ['enseignant', 'formateur', 'professeur'],
      attendance: ['presence', 'assiduite', 'absence'],
      enrollment: ['inscription', 'admission', 'adhesion']
    }
  },
  banking_insurance: {
    code: 'banking_insurance',
    label: 'Banque / Assurance / Services financiers',
    description: 'Clients, comptes, contrats, sinistres, primes, risques, credits, agences et conformite.',
    metricAliases: [
      {
        keywords: ['amount', 'balance', 'premium', 'revenue'],
        totalName: 'Encours total',
        averageName: 'Encours moyen',
        totalDescription: 'Somme des encours, primes ou montants financiers.',
        averageDescription: 'Montant moyen par compte, contrat ou client.',
        formatting: 'currency',
        synonyms: ['encours', 'prime', 'solde', 'montant financier']
      },
      {
        keywords: ['claim', 'cost', 'loss'],
        totalName: 'Charge sinistre',
        averageName: 'Cout moyen de sinistre',
        totalDescription: 'Montant total des sinistres ou pertes.',
        averageDescription: 'Cout moyen par sinistre ou dossier.',
        formatting: 'currency',
        synonyms: ['sinistre', 'indemnisation', 'perte', 'charge sinistre']
      }
    ],
    synonyms: {
      account: ['compte', 'compte bancaire', 'portefeuille'],
      contract: ['contrat', 'police', 'adhesion'],
      customer: ['client', 'assure', 'societaire'],
      branch: ['agence', 'point de vente', 'reseau'],
      risk: ['risque', 'score risque', 'conformite']
    }
  },
  real_estate_construction: {
    code: 'real_estate_construction',
    label: 'Immobilier / Construction / Patrimoine',
    description: 'Biens, ventes, locations, loyers, chantiers, couts, marges, disponibilite et actifs.',
    metricAliases: [
      {
        keywords: ['amount', 'price', 'rent', 'revenue'],
        totalName: 'Valeur immobiliere',
        averageName: 'Loyer moyen',
        totalDescription: 'Valeur totale des ventes, loyers ou actifs immobiliers.',
        averageDescription: 'Loyer ou prix moyen par bien, contrat ou operation.',
        formatting: 'currency',
        synonyms: ['loyer', 'prix de vente', 'valeur immobiliere', 'revenu locatif']
      },
      {
        keywords: ['cost', 'budget', 'expense'],
        totalName: 'Cout de chantier',
        averageName: 'Cout moyen par projet',
        totalDescription: 'Cout total des chantiers, travaux ou projets.',
        averageDescription: 'Cout moyen par bien, chantier ou projet.',
        formatting: 'currency',
        synonyms: ['chantier', 'travaux', 'cout construction', 'budget projet']
      }
    ],
    synonyms: {
      property: ['bien', 'actif', 'logement', 'local'],
      project: ['projet', 'chantier', 'programme'],
      tenant: ['locataire', 'occupant', 'client locatif'],
      agency: ['agence', 'promoteur', 'gestionnaire'],
      location: ['emplacement', 'ville', 'quartier', 'zone']
    }
  }
};
