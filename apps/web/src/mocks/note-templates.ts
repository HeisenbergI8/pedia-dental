import type { NoteTemplate, TemplateField } from "@pedia/shared";

const ANESTHESIA: TemplateField = {
  type: "select",
  key: "anesthesia",
  label: "Anesthesia",
  options: ["None", "Topical only", "Local infiltration", "Nerve block"],
};
const FINAL_RESTORATION: TemplateField = {
  type: "select",
  key: "final_restoration",
  label: "Final restoration",
  options: ["Stainless steel crown", "Composite", "Glass ionomer"],
};
const NOTES: TemplateField = { type: "text", key: "notes", label: "Notes", multiline: true };
const teeth = (label = "Teeth treated"): TemplateField => ({ type: "teeth", key: "teeth", label, required: true });

/** One template per procedure in the catalog. `procedure` is the Procedure.code. */
export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: "tpl_oral_exam",
    name: "Oral examination",
    procedure: "oral_exam",
    // Mirrors the clinic's paper Oral Examination Chart.
    fields: [
      { type: "select", key: "oral_hygiene", label: "Oral hygiene", options: ["Good", "Fair", "Poor"], required: true },
      { type: "select", key: "gingivitis", label: "Gingivitis", options: ["Mild", "Moderate", "Severe"] },
      { type: "select", key: "plaque", label: "Plaque", options: ["Mild", "Moderate", "Severe"] },
      { type: "select", key: "caries_risk", label: "Caries risk assessment", options: ["Low", "Mid", "High"], required: true },
      { type: "text", key: "health_changes", label: "Changes in health since last appointment", multiline: true },
      { type: "text", key: "current_medications", label: "Current medications" },
      { type: "checkbox", key: "facial_asymmetry", label: "Facial asymmetry" },
      { type: "checkbox", key: "lymph", label: "Lymphadenitis / lymphadenopathy" },
      { type: "checkbox", key: "trismus", label: "Trismus" },
      { type: "text", key: "others", label: "Others" },
    ],
  },
  {
    id: "tpl_prophylaxis",
    name: "Prophylaxis",
    procedure: "prophylaxis",
    fields: [
      { type: "select", key: "method", label: "Method", options: ["Rubber cup and paste", "Toothbrush prophylaxis"], required: true },
      { type: "checkbox", key: "calculus_removed", label: "Calculus removed" },
      { type: "checkbox", key: "ohi_given", label: "Oral hygiene instructions given to parent" },
      NOTES,
    ],
  },
  {
    id: "tpl_fluoride",
    name: "Fluoride application",
    procedure: "fluoride",
    fields: [
      { type: "select", key: "agent", label: "Agent", options: ["5% NaF varnish", "1.23% APF gel", "38% SDF"], required: true },
      { type: "teeth", key: "teeth", label: "Teeth (leave empty for full mouth)" },
      { type: "checkbox", key: "instructions_given", label: "Told parent: no eating or drinking for 30 minutes" },
      NOTES,
    ],
  },
  {
    id: "tpl_sealant",
    name: "Sealants",
    procedure: "sealant",
    fields: [
      teeth("Teeth sealed"),
      { type: "select", key: "material", label: "Material", options: ["Resin-based", "Glass ionomer"], required: true },
      { type: "select", key: "isolation", label: "Isolation", options: ["Cotton rolls", "Rubber dam"] },
      NOTES,
    ],
  },
  {
    id: "tpl_restoration",
    name: "Restoration",
    procedure: "restoration",
    fields: [
      teeth(),
      ANESTHESIA,
      {
        type: "select",
        key: "material",
        label: "Material",
        options: ["Composite", "Glass ionomer", "Amalgam", "Stainless steel crown", "Strip crown"],
        required: true,
      },
      NOTES,
    ],
  },
  {
    id: "tpl_pulpotomy",
    name: "Pulpotomy",
    procedure: "pulpotomy",
    fields: [
      teeth(),
      ANESTHESIA,
      { type: "select", key: "medicament", label: "Medicament", options: ["MTA", "Biodentine", "Formocresol", "Ferric sulfate"], required: true },
      { type: "checkbox", key: "hemostasis", label: "Hemostasis achieved" },
      FINAL_RESTORATION,
      NOTES,
    ],
  },
  {
    id: "tpl_pulpectomy",
    name: "Pulpectomy",
    procedure: "pulpectomy",
    fields: [
      teeth(),
      ANESTHESIA,
      { type: "select", key: "obturation", label: "Canal filling", options: ["Zinc oxide eugenol", "Iodoform paste (Vitapex)", "Metapex"], required: true },
      FINAL_RESTORATION,
      NOTES,
    ],
  },
  {
    id: "tpl_extraction",
    name: "Extraction",
    procedure: "extraction",
    fields: [
      teeth("Teeth extracted"),
      ANESTHESIA,
      {
        type: "select",
        key: "reason",
        label: "Reason",
        options: ["Caries, non-restorable", "Over-retained primary tooth", "Abscess", "Trauma", "Orthodontic"],
        required: true,
      },
      { type: "checkbox", key: "hemostasis", label: "Hemostasis achieved" },
      { type: "checkbox", key: "post_op_given", label: "Post-extraction instructions given to parent" },
      NOTES,
    ],
  },
  {
    id: "tpl_space_maintainer",
    name: "Space maintainer",
    procedure: "space_maintainer",
    fields: [
      teeth("Abutment teeth"),
      {
        type: "select",
        key: "appliance",
        label: "Appliance",
        options: ["Band and loop", "Crown and loop", "Distal shoe", "Lingual holding arch", "Nance appliance"],
        required: true,
      },
      { type: "select", key: "stage", label: "Stage", options: ["Impression / fitting", "Cementation", "Review"], required: true },
      NOTES,
    ],
  },
  {
    id: "tpl_ortho_assessment",
    name: "Orthodontic assessment",
    procedure: "ortho_assessment",
    fields: [
      { type: "select", key: "molar_relationship", label: "Molar relationship", options: ["Class I", "Class II", "Class III"], required: true },
      { type: "select", key: "crowding", label: "Crowding", options: ["None", "Mild", "Moderate", "Severe"] },
      { type: "text", key: "overjet", label: "Overjet (mm)" },
      { type: "checkbox", key: "crossbite", label: "Crossbite" },
      { type: "checkbox", key: "open_bite", label: "Open bite" },
      { type: "checkbox", key: "refer", label: "Refer to orthodontist" },
      NOTES,
    ],
  },
  {
    id: "tpl_emergency",
    name: "Emergency visit",
    procedure: "emergency",
    fields: [
      { type: "text", key: "chief_complaint", label: "Chief complaint", required: true },
      { type: "teeth", key: "teeth", label: "Teeth involved" },
      { type: "select", key: "pain", label: "Pain", options: ["None", "Mild", "Moderate", "Severe"] },
      { type: "checkbox", key: "trauma", label: "Dental trauma" },
      { type: "text", key: "treatment", label: "Treatment given", multiline: true, required: true },
    ],
  },
  {
    id: "tpl_follow_up",
    name: "Follow-up visit",
    procedure: "follow_up",
    fields: [
      { type: "teeth", key: "teeth", label: "Teeth reviewed" },
      { type: "select", key: "healing", label: "Healing", options: ["Satisfactory", "Delayed", "Complication"], required: true },
      { type: "checkbox", key: "symptoms", label: "Pain or swelling reported" },
      { type: "text", key: "plan", label: "Next steps", multiline: true },
    ],
  },
];
