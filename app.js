import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, get, child } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDnrW6WnmbEFpbWzlW9IGglxAafajt2Kyo",
  authDomain: "iset-b9974.firebaseapp.com",
  projectId: "iset-b9974",
  storageBucket: "iset-b9974.firebasestorage.app",
  messagingSenderId: "1054170284751",
  appId: "1:1054170284751:web:8f02232478430d5ae2adba",
  databaseURL: "https://iset-b9974-default-rtdb.firebaseio.com/"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Data Structures
const DEPT_SEMESTERS = {
  PPV: ['S3', 'S4', 'S5', 'S6'],
  TC: ['S1', 'S2'],
  GAB: ['S3', 'S4', 'S5', 'S6'],
  GEM: ['S3', 'S4', 'S5', 'S6'],
  PSA: ['S3', 'S4', 'S5', 'S6'],
  STA: ['S3', 'S4', 'S5', 'S6'],
};

let SUBJECTS_WITHOUT_TP = [
  "Anglais", "Anglais_2", "Français", "Français_2", "Français_s3",
  "Français_GAB_S3", "Math_et_Statistique", "Economie", "Economie_GAB", "Vulgarisation"
];

let MODULES_STRUCTURE = {
  PPV: { S3: {}, S4: {}, S5: {}, S6: {} },
  TC: { S1: {}, S2: {} },
  GAB: { S3: {}, S4: {}, S5: {}, S6: {} },
  GEM: { S3: {}, S4: {}, S5: {}, S6: {} },
  PSA: { S3: {}, S4: {}, S5: {}, S6: {} },
  STA: { S3: {}, S4: {}, S5: {}, S6: {} }
};

let SUBJECT_CREDITS = {
  PPV: { S3: {}, S4: {}, S5: {}, S6: {} },
  TC: { S1: {}, S2: {} },
  GAB: { S3: {}, S4: {}, S5: {}, S6: {} },
  GEM: { S3: {}, S4: {}, S5: {}, S6: {} },
  PSA: { S3: {}, S4: {}, S5: {}, S6: {} },
  STA: { S3: {}, S4: {}, S5: {}, S6: {} }
};

let pdfState = null;
let selectedDept = 'PPV';

// ==================== NEW RULES IMPLEMENTATION ====================

/**
 * Calculate subject status based on new rules:
 * - C (Acquired) if grade >= 10
 * - C (Acquired) if grade between 7-10 AND module average >= 10
 * - NC otherwise
 */
function calculateSubjectStatus(subjectAvg, moduleAvg) {
  if (subjectAvg >= 10) return 'C';
  if (subjectAvg >= 7 && moduleAvg >= 10) return 'C';
  return 'NC';
}

/**
 * Calculate module status based on new rules:
 * - V (Validated) if moduleAvg >= 10 AND all subjects are C
 * - V (Validated) if moduleAvg is between 9-10:
 *   - Overall semester average >= 10
 *   - No module has average < 9
 * - NV otherwise
 */
function calculateModuleStatus(moduleAvg, allSubjectsC, semesterAvg, modulesList, currentModuleAvg) {
  // Case 1: Module average >= 10 and all subjects passed
  if (moduleAvg >= 10 && allSubjectsC) return 'V';
  
  // Case 2: Module average between 9-10
  if (moduleAvg >= 9 && moduleAvg < 10) {
    // Check if semester average >= 10
    if (semesterAvg >= 10) {
      // Check if no module has average < 9
      let noModuleBelow9 = true;
      for (let modAvg of modulesList) {
        if (modAvg < 9) {
          noModuleBelow9 = false;
          break;
        }
      }
      if (noModuleBelow9) return 'V';
    }
  }
  
  return 'NV';
}

// ==================== CALCULATION ENGINE ====================

function calculateResults(notes, dept, sem) {
  const mods = MODULES_STRUCTURE[dept]?.[sem];
  if (!mods || Object.keys(mods).length === 0) return null;

  const req = getSubjectsForDeptSem(dept, sem);
  const subjAvg = {};
  const subjStatus = {};
  const subjSR = {};

  // Calculate subject averages
  for (let s of req) {
    const n = notes[s] || {};
    const exam = n['Examen'] ?? 0;
    const cc = n['Contrôle continu'] ?? 0;
    const tp = n['TP'] ?? 0;
    const ratt = n['Rattrapage'];
    const useSR = ratt !== undefined && ratt > exam;
    subjSR[s] = useSR;
    const final = useSR ? ratt : exam;
    subjAvg[s] = hasTP(s) ? (tp + cc * 2 + final * 3) / 6 : (cc * 2 + final * 3) / 5;
  }

  // First pass: Calculate module averages
  const modAvg = {};
  const modSubjectsStatus = {};
  
  for (let m in mods) {
    let w = 0, c = 0;
    const subjectsStatus = {};
    
    for (let s of mods[m].subjects) {
      const cr = SUBJECT_CREDITS[dept]?.[sem]?.[s] || 3;
      w += (subjAvg[s] || 0) * cr;
      c += cr;
    }
    modAvg[m] = c > 0 ? w / c : 0;
    modSubjectsStatus[m] = {};
    
    for (let s of mods[m].subjects) {
      modSubjectsStatus[m][s] = subjAvg[s];
    }
  }

  // Calculate semester average (used for module status)
  let totalWeighted = 0, totalCredits = 0;
  for (let s of req) {
    const cr = SUBJECT_CREDITS[dept]?.[sem]?.[s] || 3;
    totalWeighted += (subjAvg[s] || 0) * cr;
    totalCredits += cr;
  }
  const semesterAvg = totalCredits > 0 ? totalWeighted / totalCredits : 0;

  // Collect all module averages for checking
  const allModuleAverages = Object.values(modAvg);

  // Second pass: Calculate subject status (needs module average)
  for (let m in mods) {
    for (let s of mods[m].subjects) {
      subjStatus[s] = calculateSubjectStatus(subjAvg[s], modAvg[m]);
    }
  }

  // Calculate module status and credits
  const modStatus = {};
  const modCredits = {};
  
  for (let m in mods) {
    // Check if all subjects in module are C
    let allSubjectsC = true;
    let earnedCredits = 0;
    
    for (let s of mods[m].subjects) {
      const cr = SUBJECT_CREDITS[dept]?.[sem]?.[s] || 3;
      if (subjStatus[s] === 'C') {
        earnedCredits += cr;
      } else {
        allSubjectsC = false;
      }
    }
    
    modCredits[m] = earnedCredits;
    modStatus[m] = calculateModuleStatus(
      modAvg[m],
      allSubjectsC,
      semesterAvg,
      allModuleAverages,
      modAvg[m]
    );
  }

  // Determine semester status
  let hasModuleBelow9 = false;
  let hasModuleNV = false;
  
  for (let m in mods) {
    if (modAvg[m] < 9) hasModuleBelow9 = true;
    if (modStatus[m] === 'NV') hasModuleNV = true;
  }
  
  // Semester is validated if:
  // - No module has average < 9
  // - Semester average >= 10
  // - No module is NV
  const semStatus = (!hasModuleBelow9 && semesterAvg >= 10 && !hasModuleNV) ? 'Validé' : 'Non Validé';
  const hasSR = Object.values(subjSR).some(v => v);

  return {
    genMoy: semesterAvg,
    semStatus,
    modStatus,
    modCredits,
    modAvg,
    subjAvg,
    subjStatus,
    hasSR,
    modules: mods
  };
}

// ==================== HELPER FUNCTIONS ====================

function hasTP(s) {
  return !SUBJECTS_WITHOUT_TP.includes(s);
}

function displaySubjectName(s) {
  return s
    .replace(/_GAB_S\d/g, '')
    .replace(/_PPV/g, '').replace(/_GAB/g, '').replace(/_GEM/g, '')
    .replace(/_PSA/g, '').replace(/_STA/g, '').replace(/_TC/g, '')
    .replace(/_/g, ' ')
    .replace(/I\s/g, 'I.')
    .replace(/et\s/g, 'et ')
    .replace(/l eau/g, "l'eau");
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function getSubjectsForDeptSem(dept, sem) {
  const mods = MODULES_STRUCTURE[dept]?.[sem] || {};
  const list = [];
  for (let m in mods) {
    if (mods[m] && mods[m].subjects) {
      for (let s of mods[m].subjects) {
        if (!list.includes(s)) list.push(s);
      }
    }
  }
  return list;
}

// ==================== LOAD DYNAMIC STRUCTURES ====================

async function loadDynamicStructures() {
  try {
    const structSnap = await get(child(ref(db), 'structure'));
    if (structSnap.exists()) {
      const structData = structSnap.val();
      for (let dept in structData) {
        if (MODULES_STRUCTURE[dept]) {
          for (let sem in structData[dept]) {
            if (!MODULES_STRUCTURE[dept][sem]) MODULES_STRUCTURE[dept][sem] = {};
            Object.assign(MODULES_STRUCTURE[dept][sem], structData[dept][sem]);
            
            for (let mKey in structData[dept][sem]) {
              const module = structData[dept][sem][mKey];
              if (module.subjectCredits) {
                if (!SUBJECT_CREDITS[dept][sem]) SUBJECT_CREDITS[dept][sem] = {};
                Object.assign(SUBJECT_CREDITS[dept][sem], module.subjectCredits);
              }
              if (module.subjects) {
                for (let s of module.subjects) {
                  if (module.subjectCredits?.[s] === undefined) {
                    if (!SUBJECT_CREDITS[dept][sem]) SUBJECT_CREDITS[dept][sem] = {};
                    SUBJECT_CREDITS[dept][sem][s] = 3;
                  }
                }
              }
            }
          }
        }
      }
    }

    const noTPSnap = await get(child(ref(db), 'no_tp_subjects'));
    if (noTPSnap.exists()) {
      SUBJECTS_WITHOUT_TP = [...new Set([...SUBJECTS_WITHOUT_TP, ...noTPSnap.val()])];
    }

    await loadDefaultStructures();
  } catch (e) {
    console.warn('Error loading dynamic structures:', e);
    await loadDefaultStructures();
  }
}

async function loadDefaultStructures() {
  if (Object.keys(MODULES_STRUCTURE.PPV.S3).length === 0) {
    MODULES_STRUCTURE.PPV.S3 = {
      M31_PPV: { name: "Module 31", credit: 6.0, subjects: ["Français_s3", "Economie"] },
      M32_PPV: { name: "Module 32", credit: 8.0, subjects: ["I_Agronomie", "I_Horticulture"] },
      M33_PPV: { name: "Module 33", credit: 8.0, subjects: ["Pesticides_agricoles", "Entomologie_et_Nemato"] },
      M34_PPV: { name: "Module 34", credit: 8.0, subjects: ["Science_des_sols", "Science_des_plantes"] }
    };
    MODULES_STRUCTURE.PPV.S4 = {
      M41_PPV: { name: "Module 41", credit: 3.0, subjects: ["Vulgarisation"] },
      M42_PPV: { name: "Module 42", credit: 7.0, subjects: ["Technique_de_propagation", "Technique_d_irrigation_et_BEC"] },
      M43_PPV: { name: "Module 43", credit: 7.0, subjects: ["Ecophysiologie_et_Biochimie", "Fertilite_du_sol"] },
      M44_PPV: { name: "Module 44", credit: 6.0, subjects: ["Methodes_de_diagnostic", "Malherbologie"] }
    };
    
    SUBJECT_CREDITS.PPV.S3 = {
      "Français_s3": 3, "Economie": 3, "I_Agronomie": 4, "I_Horticulture": 4,
      "Pesticides_agricoles": 4, "Entomologie_et_Nemato": 4, "Science_des_sols": 4, "Science_des_plantes": 4
    };
    SUBJECT_CREDITS.PPV.S4 = {
      "Vulgarisation": 3, "Technique_de_propagation": 4, "Technique_d_irrigation_et_BEC": 3,
      "Ecophysiologie_et_Biochimie": 4, "Fertilite_du_sol": 3, "Methodes_de_diagnostic": 3, "Malherbologie": 3
    };
  }
  
  if (Object.keys(MODULES_STRUCTURE.GAB.S3).length === 0) {
    MODULES_STRUCTURE.GAB.S3 = {
      M31_GAB: { name: "Module 31", credit: 6.0, subjects: ["Français_GAB_S3", "Economie_GAB"] },
      M32_GAB: { name: "Module 32", credit: 9.0, subjects: ["Resistance_de_materiaux", "Energie_renouvelable", "Environnement"] },
      M33_GAB: { name: "Module 33", credit: 7.0, subjects: ["Topographie", "Dessin_assiste_par_ordinateur"] },
      M34_GAB: { name: "Module 34", credit: 8.0, subjects: ["Mecanique_de_fluides", "Chimie_de_leau"] }
    };
    SUBJECT_CREDITS.GAB.S3 = {
      "Français_GAB_S3": 3, "Economie_GAB": 3, "Resistance_de_materiaux": 3, "Energie_renouvelable": 3,
      "Environnement": 3, "Topographie": 4, "Dessin_assiste_par_ordinateur": 3, "Mecanique_de_fluides": 4, "Chimie_de_leau": 4
    };
  }
}

// ==================== PDF GENERATION ====================

window.generatePDF = function() {
  if (!pdfState) {
    alert("Données non disponibles.");
    return;
  }
  
  const { notes, res, studentId, studentName, dept, sem } = pdfState;
  const showSR = res.hasSR;
  const currentYear = new Date().getFullYear();
  const academicYear = `${currentYear - 1}-${currentYear}`;

  let content = `
    <div style="padding:15mm 10mm 10mm 10mm; font-family:Arial,Helvetica,sans-serif; font-size:11pt;">
      <div style="font-weight:bold; font-size:12pt; margin-bottom:5px;">Institut Supérieur d'Enseignement Technologique de Rosso</div>
      <div style="display:flex; justify-content:space-between; margin-top:8px;">
        <span style="font-weight:bold; font-size:14pt;">Résultats du ${escapeHtml(sem)} — ${escapeHtml(dept)}</span>
        <span>Année Universitaire : ${academicYear}</span>
      </div>
      <table style="width:100%; border-collapse:collapse; border:1px solid #000; font-size:10pt; margin-top:10px;">
        <thead>
          <tr style="background:#e8f4e8;">
            <th style="border:1px solid #000; padding:3px; text-align:center;">Numéro</th>
            <th style="border:1px solid #000; padding:3px; text-align:center;">Nom et Prénom</th>
            <th style="border:1px solid #000; padding:3px; text-align:center;">TP</th>
            <th style="border:1px solid #000; padding:3px; text-align:center;">CC</th>
            <th style="border:1px solid #000; padding:3px; text-align:center;">Examen</th>
            ${showSR ? '<th style="border:1px solid #000; padding:3px; text-align:center;">SR</th>' : ''}
            <th style="border:1px solid #000; padding:3px; text-align:center;">NF°</th>
            <th style="border:1px solid #000; padding:3px; text-align:center;">Crédit</th>
            <th style="border:1px solid #000; padding:3px; text-align:center;">Obs</th>
           </tr>
        </thead>
        <tbody>
          <tr style="background:#f0f8ff; font-weight:bold;">
            <td style="border:1px solid #000; padding:4px; text-align:center;">${escapeHtml(studentId)}</td>
            <td style="border:1px solid #000; padding:4px; text-align:left;">${escapeHtml(studentName)}</td>
            <td style="border:1px solid #000; padding:4px;"></td>
            <td style="border:1px solid #000; padding:4px;"></td>
            <td style="border:1px solid #000; padding:4px;"></td>
            ${showSR ? '<td style="border:1px solid #000; padding:4px;"></td>' : ''}
            <td style="border:1px solid #000; padding:4px;"></td>
            <td style="border:1px solid #000; padding:4px;"></td>
            <td style="border:1px solid #000; padding:4px;"></td>
          </tr>`;

  for (let m in res.modules) {
    const mod = res.modules[m];
    content += `
          <tr style="background:#d4edda; font-weight:bold;">
            <td style="border:none; border-top:1px solid #000; border-bottom:1px solid #000; border-left:1px solid #000; padding:2px; text-align:center;">${escapeHtml(m.replace(/_[A-Z]+$/, ''))}</td>
            <td style="border:none; border-top:1px solid #000; border-bottom:1px solid #000; padding:2px; text-align:left;">${escapeHtml(mod.name)}</td>
            <td style="border:none; border-top:1px solid #000; border-bottom:1px solid #000; padding:2px;"></td>
            <td style="border:none; border-top:1px solid #000; border-bottom:1px solid #000; padding:2px;"></td>
            <td style="border:none; border-top:1px solid #000; border-bottom:1px solid #000; padding:2px;"></td>
            ${showSR ? '<td style="border:none; border-top:1px solid #000; border-bottom:1px solid #000; padding:2px;"></td>' : ''}
            <td style="border:none; border-top:1px solid #000; border-bottom:1px solid #000; padding:2px; font-weight:bold; text-align:center;">${res.modAvg[m].toFixed(2)}</td>
            <td style="border:none; border-top:1px solid #000; border-bottom:1px solid #000; padding:2px; text-align:center;">${res.modCredits[m].toFixed(1)}</td>
            <td style="border:none; border-top:1px solid #000; border-bottom:1px solid #000; border-right:1px solid #000; padding:2px; text-align:center;">${res.modStatus[m]}</td>
          </tr>`;
    
    for (let s of mod.subjects) {
      const n = notes[s] || {};
      const tp = hasTP(s) ? (n['TP'] !== undefined ? n['TP'].toFixed(2) : '') : '';
      const cc = n['Contrôle continu'] !== undefined ? n['Contrôle continu'].toFixed(2) : '';
      const exam = n['Examen'] !== undefined ? n['Examen'].toFixed(2) : '';
      const ratt = n['Rattrapage'];
      const sr = ratt !== undefined ? ratt.toFixed(2) : '';
      const cr = SUBJECT_CREDITS[dept]?.[sem]?.[s] || 3;
      content += `
          <tr>
            <td style="border:1px solid #000; padding:1px; text-align:center;"></td>
            <td style="border:1px solid #000; padding:1px; text-align:left; padding-left:20px;">${escapeHtml(displaySubjectName(s))}</td>
            <td style="border:1px solid #000; padding:1px; text-align:center;">${tp}</td>
            <td style="border:1px solid #000; padding:1px; text-align:center;">${cc}</td>
            <td style="border:1px solid #000; padding:1px; text-align:center;">${exam}</td>
            ${showSR ? `<td style="border:1px solid #000; padding:1px; text-align:center;">${sr}</td>` : ''}
            <td style="border:1px solid #000; padding:1px; text-align:center; font-weight:bold;">${res.subjAvg[s].toFixed(2)}</td>
            <td style="border:1px solid #000; padding:1px; text-align:center;">${cr.toFixed(1)}</td>
            <td style="border:1px solid #000; padding:1px; text-align:center;">${res.subjStatus[s]}</td>
          </tr>`;
    }
  }

  const colspanVal = showSR ? 6 : 5;
  content += `
          <tr>
            <td colspan="${colspanVal}" style="border:none; padding:6px 4px 2px 4px; text-align:right; font-weight:bold;">Moyenne Semestre :</td>
            <td style="border:none; padding:6px 4px 2px 4px; font-weight:bold; text-align:center;">${res.genMoy.toFixed(2)}</td>
            <td style="border:none; padding:6px 4px 2px 4px;"></td>
            <td style="border:none; padding:6px 4px 2px 4px; font-weight:bold; text-align:center;">${res.semStatus}</td>
          </tr>
        </tbody>
      </table>
    </div>`;

  const el = document.createElement('div');
  el.innerHTML = content;
  document.body.appendChild(el);
  
  html2pdf().set({
    margin: [0, 5, 5, 5],
    filename: `Releve_${studentId}_${dept}_${sem}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, letterRendering: true, scrollY: 0 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }).from(el).save()
    .then(() => document.body.removeChild(el))
    .catch(err => {
      console.error(err);
      alert('Erreur lors de la génération du PDF.');
      document.body.removeChild(el);
    });
};

// ==================== BUILD HTML DISPLAY ====================

function buildReleveHTML(id, name, notes, res, dept, sem) {
  const showSR = res.hasSR;
  const colspanVal = showSR ? 6 : 5;

  let html = `
    <div style="overflow-x:auto;">
    <table class="releve-table">
      <thead>
        <tr>
          <th>Numéro</th>
          <th>Nom et Prénom</th>
          <th>TP</th>
          <th>CC</th>
          <th>Examen</th>
          ${showSR ? '<th>SR</th>' : ''}
          <th>NF°</th>
          <th>Crédit</th>
          <th>Obs</th>
        </tr>
      </thead>
      <tbody>
        <tr class="student-info-row">
          <td>${escapeHtml(id)}</td>
          <td style="text-align:left;">${escapeHtml(name)}</td>
          <td></td><td></td><td></td>
          ${showSR ? '<td></td>' : ''}
          <td></td><td></td><td></td>
        </tr>`;

  for (let m in res.modules) {
    const mod = res.modules[m];
    const mLabel = m.replace(/_[A-Z]+$/, '');
    html += `
        <tr class="module-row">
          <td>${escapeHtml(mLabel)}</td>
          <td style="text-align:left;">${escapeHtml(mod.name)}</td>
          <td></td><td></td><td></td>
          ${showSR ? '<td></td>' : ''}
          <td style="font-weight:bold;">${res.modAvg[m].toFixed(2)}</td>
          <td>${res.modCredits[m].toFixed(1)}</td>
          <td class="${res.modStatus[m] === 'V' ? 'status-V' : 'status-NV'}">${res.modStatus[m]}</td>
        </tr>`;
    
    for (let s of mod.subjects) {
      const n = notes[s] || {};
      const tp = hasTP(s) ? (n['TP'] !== undefined ? n['TP'].toFixed(2) : '') : '';
      const cc = n['Contrôle continu'] !== undefined ? n['Contrôle continu'].toFixed(2) : '';
      const exam = n['Examen'] !== undefined ? n['Examen'].toFixed(2) : '';
      const ratt = n['Rattrapage'];
      const sr = ratt !== undefined ? ratt.toFixed(2) : '';
      const cr = SUBJECT_CREDITS[dept]?.[sem]?.[s] || 3;
      html += `
        <tr class="subject-row">
          <td></td>
          <td style="text-align:left; padding-left:30px;">${escapeHtml(displaySubjectName(s))}</td>
          <td>${tp}</td>
          <td>${cc}</td>
          <td>${exam}</td>
          ${showSR ? `<td>${sr}</td>` : ''}
          <td style="font-weight:bold;">${res.subjAvg[s].toFixed(2)}</td>
          <td>${cr.toFixed(1)}</td>
          <td class="${res.subjStatus[s] === 'C' ? 'status-C' : 'status-NC'}">${res.subjStatus[s]}</td>
        </tr>`;
    }
  }

  html += `
        <tr class="moyenne-row">
          <td colspan="${colspanVal}" style="text-align:right; font-weight:bold;">Moyenne Semestre :</td>
          <td style="font-weight:bold;">${res.genMoy.toFixed(2)}</td>
          <td></td>
          <td class="${res.semStatus === 'Validé' ? 'status-V' : 'status-NV'}" style="font-weight:bold;">${res.semStatus}</td>
        </tr>
      </tbody>
    </table>
    </div>`;
  return html;
}

// ==================== SEARCH FUNCTION ====================

window.searchStudentResult = async () => {
  const id = document.getElementById('studentIdInput').value.trim();
  const cont = document.getElementById('studentResultContainer');
  const noRes = document.getElementById('noResultMessage');
  const dept = selectedDept;

  if (!id) {
    alert("Veuillez entrer votre numéro d'étudiant");
    return;
  }

  pdfState = null;
  cont.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i><p>Chargement...</p></div>';
  cont.style.display = 'block';
  noRes.style.display = 'none';

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('TIMEOUT')), 15000);
  });

  const sems = DEPT_SEMESTERS[dept] || [];
  let data = null, sem = null;

  try {
    for (let s of sems) {
      try {
        const snap = await Promise.race([
          get(child(ref(db), `results/${dept}/${s}/${id}`)),
          timeoutPromise
        ]);
        clearTimeout(timeoutId);
        if (snap.exists()) {
          data = snap.val();
          sem = s;
          break;
        }
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.message === 'TIMEOUT') throw err;
        continue;
      }
    }
    clearTimeout(timeoutId);

    if (!data) {
      cont.style.display = 'none';
      noRes.style.display = 'block';
      return;
    }

    let name = '';
    const notes = {};
    for (let k in data) {
      if (data[k].name) name = data[k].name;
      if (!notes[data[k].subject]) notes[data[k].subject] = {};
      notes[data[k].subject][data[k].type] = data[k].grade;
    }

    const req = getSubjectsForDeptSem(dept, sem);
    let complete = req.length > 0;
    if (complete) {
      for (let s of req) {
        const htp = hasTP(s);
        if (!notes[s]?.['Examen'] || !notes[s]?.['Contrôle continu'] || (htp && !notes[s]?.['TP'])) {
          complete = false;
          break;
        }
      }
    }

    let html = `<div class="student-header">
      <h3>${escapeHtml(name) || 'Étudiant'}</h3>
      <p>N° ${escapeHtml(id)} | ${dept} | ${sem}</p>
    </div>`;

    if (complete) {
      const res = calculateResults(notes, dept, sem);
      if (res) {
        pdfState = { notes, res, studentId: id, studentName: name, dept, sem };
        html += buildReleveHTML(id, name, notes, res, dept, sem);
        html += `<div style="text-align:center; margin-top:0.5rem;">
          <button class="pdf-link" onclick="generatePDF()"><i class="fas fa-file-pdf"></i> Télécharger mon relevé PDF</button>
        </div>`;
      } else {
        html += `<div class="neutral-message">Impossible de calculer les résultats.</div>`;
      }
    } else {
      let hasTPdata = false, hasCC = false, hasExam = false;
      for (let s of req) {
        if (notes[s]?.['TP'] !== undefined) hasTPdata = true;
        if (notes[s]?.['Contrôle continu'] !== undefined) hasCC = true;
        if (notes[s]?.['Examen'] !== undefined) hasExam = true;
      }
      
      if (hasTPdata) {
        html += `<h4 class="section-subtitle">Résultats TP</h4>
          <table class="simple-table"><thead><tr><th>Matière</th><th>Note TP</th></tr></thead><tbody>`;
        for (let s of req) {
          if (hasTP(s)) {
            const n = notes[s]?.['TP'];
            html += `<tr><td>${escapeHtml(displaySubjectName(s))}</td><td>${n !== undefined ? n.toFixed(2) : ''}</td></tr>`;
          }
        }
        html += `</tbody></table>`;
      }
      
      if (hasCC) {
        html += `<h4 class="section-subtitle">Résultats Contrôle continu</h4>
          <table class="simple-table"><thead><tr><th>Matière</th><th>Note CC</th></tr></thead><tbody>`;
        for (let s of req) {
          const n = notes[s]?.['Contrôle continu'];
          html += `<tr><td>${escapeHtml(displaySubjectName(s))}</td><td>${n !== undefined ? n.toFixed(2) : ''}</td></tr>`;
        }
        html += `</tbody></table>`;
      }
      
      if (hasExam) {
        html += `<h4 class="section-subtitle">Résultats Examen</h4>
          <table class="simple-table"><thead><tr><th>Matière</th><th>Note Examen</th></tr></thead><tbody>`;
        for (let s of req) {
          const n = notes[s]?.['Examen'];
          html += `<tr><td>${escapeHtml(displaySubjectName(s))}</td><td>${n !== undefined ? n.toFixed(2) : ''}</td></tr>`;
        }
        html += `</tbody></table>`;
      }
      
      html += `<div class="neutral-message">Les résultats ne sont pas encore finalisés.</div>`;
    }

    cont.innerHTML = html;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.message === 'TIMEOUT') {
      cont.innerHTML = `<div class="error-state"><i class="fas fa-clock"></i><h3>Délai dépassé</h3><p>Vérifiez votre connexion.</p><button onclick="searchStudentResult()">Réessayer</button></div>`;
    } else {
      cont.innerHTML = `<div class="error-state"><i class="fas fa-exclamation-circle"></i><h3>Erreur de connexion</h3><p>Veuillez réessayer.</p><button onclick="searchStudentResult()">Réessayer</button></div>`;
    }
    cont.style.display = 'block';
    noRes.style.display = 'none';
  }
};

// ==================== DEPARTMENT SELECTION ====================

function selectDept(dept) {
  selectedDept = dept;
  document.querySelectorAll('.dept-btn').forEach(btn => {
    if (btn.getAttribute('data-dept') === dept) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  document.getElementById('studentResultContainer').style.display = 'none';
  document.getElementById('studentResultContainer').innerHTML = '';
  document.getElementById('noResultMessage').style.display = 'none';
  document.getElementById('studentIdInput').value = '';
}

// ==================== ANNOUNCEMENTS ====================

async function afficherAnnonce() {
  try {
    const snap = await get(child(ref(db), 'annonces/active'));
    const c = document.getElementById('annonceContainer');
    if (!snap.exists()) {
      c.innerHTML = '';
      return;
    }
    const a = snap.val();
    if (!a.texte || (a.expiration && Date.now() >= a.expiration)) {
      c.innerHTML = '';
      return;
    }
    const d = new Date(a.expiration).toLocaleString('fr-FR');
    c.innerHTML = `<div class="annonce-bloc">
      <div style="flex:1">
        <span class="annonce-icone"><i class="fas fa-bullhorn"></i></span>
        <span class="annonce-texte"><strong>Annonce :</strong> ${escapeHtml(a.texte)}</span>
        <div class="annonce-date">Visible jusqu'au ${d}</div>
      </div>
    </div>`;
  } catch (e) {
    console.warn('Error loading announcement:', e);
  }
}

// ==================== EVENT LISTENERS & INIT ====================

function setupEventListeners() {
  // Department buttons
  document.querySelectorAll('.dept-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const dept = btn.getAttribute('data-dept');
      selectDept(dept);
    });
  });
  
  // Search button
  document.getElementById('searchBtn').addEventListener('click', () => {
    searchStudentResult();
  });
  
  // Enter key in input
  document.getElementById('studentIdInput').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      searchStudentResult();
    }
  });
}

async function init() {
  await loadDynamicStructures();
  setupEventListeners();
  afficherAnnonce();
}

// Start the application
init();
