export default async function handler(req, res) {
  const docx = await import('docx');
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
          AlignmentType, LevelFormat, BorderStyle, WidthType, ShadingType,
          PageBreak, PageNumber, Header, Footer } = docx;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { data, additionalData, companyName, scoreResult, overlaps, overlapResolutions, overlapPrnShifts } = req.body;

    const BLUE = "1e40af";
    const GRAY = "666666";
    const LIGHT_GRAY = "888888";
    const name = data?.personalInfo?.fullName || 'Candidate';

    // Dedup helpers (mirror frontend logic)
    function dedupLicenses(aiLics, manualLics) {
      const all = [...(aiLics||[]).map(l=>({...l,source:'ai'})), ...(manualLics||[]).map(l=>({...l,source:'manual'}))];
      const map = {};
      all.forEach(l => { const k = (l.state||'').toUpperCase(); if (!map[k] || l.source==='manual') map[k] = l; });
      return Object.values(map);
    }
    function dedupCerts(aiCerts, manualCerts) {
      const norm = s => (s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
      const aiArr = (aiCerts||[]).map(c => typeof c === 'string' ? {name:c} : c);
      const manArr = (manualCerts||[]).map(c => typeof c === 'string' ? {name:c} : c);
      const map = {};
      aiArr.forEach(c => { if(c.name) map[norm(c.name)] = {...c, source:'ai'}; });
      manArr.forEach(c => { if(c.name) map[norm(c.name)] = {...c, source:'manual'}; });
      return Object.values(map);
    }
    function getOverlapNoteForJob(jobIdx, overlaps, resolutions, prnShifts) {
      const notes = [];
      (overlaps||[]).forEach((ov,oi) => {
        if (ov.jobAIndex === jobIdx || ov.jobBIndex === jobIdx) {
          const res = resolutions?.[oi];
          if (res === 'prn') {
            const shifts = prnShifts?.[oi] || '';
            const other = ov.jobAIndex === jobIdx ? ov.jobB : ov.jobA;
            notes.push(`Concurrent PRN/Per Diem position — overlaps with ${other}${shifts ? ` (avg ${shifts})` : ''}`);
          } else if (res === 'transition') {
            const other = ov.jobAIndex === jobIdx ? ov.jobB : ov.jobA;
            notes.push(`Transition period between positions — overlaps with ${other}`);
          } else if (res === 'travel') {
            const other = ov.jobAIndex === jobIdx ? ov.jobB : ov.jobA;
            notes.push(`Staff position held alongside travel assignment — overlaps with ${other}`);
          }
        }
      });
      return notes;
    }

    const allLicenses = dedupLicenses(data?.licenses, additionalData?.licenses);
    const allCertObjs = dedupCerts(data?.certifications, additionalData?.certifications);
    const allCerts = allCertObjs.map(c => c.name).filter(Boolean);
    const licenseStates = allLicenses.map(l => l.state).filter(Boolean);
    const hasCompact = allLicenses.some(l => l.compact);

    // Score
    const sc = scoreResult?.total || 0;
    const scoreColor = sc >= 80 ? "16a34a" : sc >= 60 ? "2563eb" : sc >= 40 ? "d97706" : "dc2626";
    const scoreLabel = sc >= 80 ? "Strong candidate — submit with confidence" : sc >= 60 ? "Solid candidate — review pay/location fit" : sc >= 40 ? "Needs work — check certs & license gaps" : "Weak profile — may need additional experience";

    // Table helpers
    const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
    const borders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
    const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
    const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

    // ==================== PAGE 1: RESUME PROFILE ====================
    const page1 = [];

    // Company header
    if (companyName) {
      page1.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: companyName.toUpperCase(), bold: true, size: 28, color: BLUE, font: "Calibri" })],
        spacing: { after: 60 }
      }));
    }

    // Candidate name
    page1.push(new Paragraph({
      children: [new TextRun({ text: name, bold: true, size: 36, font: "Calibri" })],
      spacing: { after: 40 }
    }));

    // Contact info
    const contactParts = [data?.personalInfo?.phone, data?.personalInfo?.email, data?.personalInfo?.location].filter(Boolean);
    if (contactParts.length) {
      page1.push(new Paragraph({
        children: [new TextRun({ text: contactParts.join('  |  '), size: 19, color: GRAY, font: "Calibri" })],
        spacing: { after: 120 }
      }));
    }

    // Blue highlight box (using table with blue background)
    const highlightParts = [
      `${data?.yearsExperience || '—'} Years Exp`,
      data?.primarySpecialty || '—',
      `Licensed: ${licenseStates.join(', ') || '—'}${hasCompact ? ' (Compact)' : ''}`,
      `Certs: ${allCerts.slice(0, 6).join(', ') || '—'}`,
    ];
    if (scoreResult) highlightParts.push(`Score: ${scoreResult.total}/100`);

    page1.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [9360],
      rows: [new TableRow({
        children: [new TableCell({
          borders: noBorders,
          width: { size: 9360, type: WidthType.DXA },
          shading: { fill: BLUE, type: ShadingType.CLEAR },
          margins: { top: 100, bottom: 100, left: 200, right: 200 },
          children: [new Paragraph({
            children: [new TextRun({ text: highlightParts.join('   |   '), color: "FFFFFF", size: 19, bold: true, font: "Calibri" })]
          })]
        })]
      })]
    }));

    // Score label
    if (scoreResult) {
      page1.push(new Paragraph({
        children: [new TextRun({ text: scoreLabel, size: 18, italics: true, color: scoreColor, font: "Calibri" })],
        spacing: { before: 80, after: 80 }
      }));
    }

    // Summary bullets
    if (additionalData?.summaryBullets?.some(b => b)) {
      page1.push(new Paragraph({
        children: [new TextRun({ text: "PROFESSIONAL SUMMARY", bold: true, size: 21, color: BLUE, font: "Calibri" })],
        spacing: { before: 160, after: 80 },
        border: { bottom: { color: BLUE, space: 4, size: 6, style: BorderStyle.SINGLE } }
      }));
      additionalData.summaryBullets.filter(b => b).forEach(bullet => {
        page1.push(new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun({ text: bullet, size: 20, font: "Calibri" })],
          spacing: { after: 40 }
        }));
      });
    }

    // ===== CREDENTIALS & EDUCATION =====
    page1.push(new Paragraph({
      children: [new TextRun({ text: "CREDENTIALS & EDUCATION", bold: true, size: 21, color: BLUE, font: "Calibri" })],
      spacing: { before: 240, after: 100 },
      border: { bottom: { color: BLUE, space: 4, size: 6, style: BorderStyle.SINGLE } }
    }));

    // Licenses sub-section
    if (allLicenses.length) {
      page1.push(new Paragraph({
        children: [new TextRun({ text: "Licenses", bold: true, size: 20, font: "Calibri" })],
        spacing: { before: 80, after: 40 }
      }));
      allLicenses.forEach(lic => {
        const runs = [];
        runs.push(new TextRun({ text: `${lic.state || ''}`, bold: true, size: 20, color: BLUE, font: "Calibri" }));
        runs.push(new TextRun({ text: `  ${lic.type || 'RN'}`, size: 20, font: "Calibri" }));
        if (lic.compact) runs.push(new TextRun({ text: '  (Compact)', size: 18, color: "16a34a", bold: true, font: "Calibri" }));
        const details = [lic.licenseNumber ? `#${lic.licenseNumber}` : '', lic.expirationDate ? `Exp: ${lic.expirationDate}` : ''].filter(Boolean).join('  |  ');
        if (details) runs.push(new TextRun({ text: `    ${details}`, size: 17, color: LIGHT_GRAY, font: "Calibri" }));
        page1.push(new Paragraph({ children: runs, spacing: { after: 30 }, indent: { left: 240 } }));
      });
    }

    // Certifications sub-section
    if (allCerts.length) {
      page1.push(new Paragraph({
        children: [new TextRun({ text: "Certifications", bold: true, size: 20, font: "Calibri" })],
        spacing: { before: 80, after: 40 }
      }));
      // Show as comma-separated with details
      allCertObjs.filter(c => c.name).forEach(cert => {
        const runs = [new TextRun({ text: cert.name, bold: true, size: 19, font: "Calibri" })];
        const meta = [cert.issuingBody, cert.certNumber ? `#${cert.certNumber}` : '', cert.expirationDate ? `Exp: ${cert.expirationDate}` : ''].filter(Boolean).join('  |  ');
        if (meta) runs.push(new TextRun({ text: `    ${meta}`, size: 17, color: LIGHT_GRAY, font: "Calibri" }));
        page1.push(new Paragraph({ children: runs, spacing: { after: 20 }, indent: { left: 240 } }));
      });
    }

    // Education
    if (data?.education) {
      page1.push(new Paragraph({
        children: [new TextRun({ text: "Education", bold: true, size: 20, font: "Calibri" })],
        spacing: { before: 80, after: 40 }
      }));
      page1.push(new Paragraph({
        children: [
          new TextRun({ text: `${data.education.degree || ''} — ${data.education.school || ''}`, size: 20, font: "Calibri" }),
          data.education.graduationDate ? new TextRun({ text: `  (${data.education.graduationDate})`, size: 18, color: LIGHT_GRAY, font: "Calibri" }) : new TextRun(""),
        ],
        indent: { left: 240 }
      }));
    }

    // ===== WORK HISTORY =====
    page1.push(new Paragraph({
      children: [new TextRun({ text: "WORK HISTORY", bold: true, size: 21, color: BLUE, font: "Calibri" })],
      spacing: { before: 240, after: 100 },
      border: { bottom: { color: BLUE, space: 4, size: 6, style: BorderStyle.SINGLE } }
    }));

    (data?.workHistory || []).forEach((job, i) => {
      // Job title + dates
      page1.push(new Paragraph({
        children: [
          new TextRun({ text: job.title || '', bold: true, size: 21, font: "Calibri" }),
          new TextRun({ text: `     ${job.startDate || ''} – ${job.endDate || ''}`, size: 18, color: LIGHT_GRAY, font: "Calibri" }),
        ],
        spacing: { before: i > 0 ? 180 : 0, after: 20 }
      }));

      // Facility + location
      page1.push(new Paragraph({
        children: [
          new TextRun({ text: job.facility || '', size: 20, color: BLUE, font: "Calibri" }),
          new TextRun({ text: ` — ${job.city || ''}, ${job.state || ''}`, size: 18, color: LIGHT_GRAY, font: "Calibri" }),
        ],
        spacing: { after: 20 }
      }));

      // Hospital metadata (gray box)
      if (job.hospitalData) {
        const meta = `${job.hospitalData.beds} beds  |  ${job.hospitalData.traumaLevel}  |  ${job.hospitalData.teaching ? 'Teaching' : 'Non-Teaching'}  |  ${job.hospitalData.emr}`;
        page1.push(new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [9360],
          rows: [new TableRow({
            children: [new TableCell({
              borders: noBorders,
              width: { size: 9360, type: WidthType.DXA },
              shading: { fill: "F3F4F6", type: ShadingType.CLEAR },
              margins: { top: 40, bottom: 40, left: 120, right: 120 },
              children: [new Paragraph({
                children: [new TextRun({ text: meta, size: 16, color: "999999", italics: true, font: "Calibri" })]
              })]
            })]
          })]
        }));
      }

      // Overlap notes
      const jobOverlapNotes = getOverlapNoteForJob(i, overlaps || [], overlapResolutions || {}, overlapPrnShifts || {});
      jobOverlapNotes.forEach(note => {
        page1.push(new Paragraph({
          children: [new TextRun({ text: `⚠ ${note}`, size: 17, color: "b45309", italics: true, font: "Calibri" })],
          spacing: { after: 30 }, indent: { left: 360 }
        }));
      });

      // Responsibilities
      (job.responsibilities || []).forEach(resp => {
        page1.push(new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun({ text: resp, size: 19, font: "Calibri" })],
          spacing: { after: 20 }
        }));
      });

      // Charge experience
      if (job.chargeExperience) {
        page1.push(new Paragraph({
          children: [new TextRun({ text: '★ Charge Nurse Experience', bold: true, size: 18, color: "7c3aed", font: "Calibri" })],
          spacing: { after: 20 }, indent: { left: 360 }
        }));
      }
    });

    // ==================== PAGE 2: SKILLS CHECKLIST ====================
    const page2 = [];
    if (companyName) {
      page2.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: `${companyName.toUpperCase()} — SKILLS CHECKLIST`, bold: true, size: 24, color: BLUE, font: "Calibri" })],
        spacing: { after: 120 }
      }));
    }
    page2.push(new Paragraph({
      children: [new TextRun({ text: `Skills Checklist for ${name}`, size: 24, bold: true, font: "Calibri" })],
      spacing: { after: 60 }
    }));
    page2.push(new Paragraph({
      children: [new TextRun({ text: `Primary Specialty: ${data?.primarySpecialty || '—'}`, size: 20, font: "Calibri" })],
      spacing: { after: 160 }
    }));

    const skills = additionalData?.skills || {};
    const skillCategories = {
      'Clinical Skills': skills.clinical || [],
      'Technical Skills': skills.technical || [],
      'Equipment': skills.equipment || [],
      'Patient Populations': skills.populations || [],
      'Documentation': skills.documentation || [],
      'Other': skills.other || [],
    };

    const skillRows = [];
    // Header row
    skillRows.push(new TableRow({
      children: [
        new TableCell({
          borders, width: { size: 2500, type: WidthType.DXA },
          shading: { fill: "EEF2FF", type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({ children: [new TextRun({ text: "Category", bold: true, size: 19, color: BLUE, font: "Calibri" })] })]
        }),
        new TableCell({
          borders, width: { size: 6860, type: WidthType.DXA },
          shading: { fill: "EEF2FF", type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({ children: [new TextRun({ text: "Skills", bold: true, size: 19, color: BLUE, font: "Calibri" })] })]
        }),
      ]
    }));
    Object.entries(skillCategories).forEach(([cat, items]) => {
      if (items.length) {
        skillRows.push(new TableRow({
          children: [
            new TableCell({
              borders, width: { size: 2500, type: WidthType.DXA },
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: cat, bold: true, size: 18, font: "Calibri" })] })]
            }),
            new TableCell({
              borders, width: { size: 6860, type: WidthType.DXA },
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: items.join(', '), size: 18, font: "Calibri" })] })]
            }),
          ]
        }));
      }
    });
    if (skillRows.length > 1) {
      page2.push(new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2500, 6860],
        rows: skillRows
      }));
    }

    // ==================== PAGE 3: CERTIFICATIONS TABLE ====================
    const page3 = [];
    if (companyName) {
      page3.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: `${companyName.toUpperCase()} — CERTIFICATIONS`, bold: true, size: 24, color: BLUE, font: "Calibri" })],
        spacing: { after: 120 }
      }));
    }
    page3.push(new Paragraph({
      children: [new TextRun({ text: `Certifications for ${name}`, size: 24, bold: true, font: "Calibri" })],
      spacing: { after: 160 }
    }));

    const certColWidths = [2200, 2200, 1800, 1580, 1580];
    const certHeaderCells = ["Certification", "Issuing Body", "Number", "Issue Date", "Expiration"].map((h, idx) =>
      new TableCell({
        borders, width: { size: certColWidths[idx], type: WidthType.DXA },
        shading: { fill: "EEF2FF", type: ShadingType.CLEAR },
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18, color: BLUE, font: "Calibri" })] })]
      })
    );
    const certRows = [new TableRow({ children: certHeaderCells })];

    allCertObjs.filter(c => c.name).forEach((cert, idx) => {
      const vals = [cert.name, cert.issuingBody || '—', cert.certNumber || '—', cert.issueDate || '—', cert.expirationDate || '—'];
      const rowShading = idx % 2 === 1 ? "F9FAFB" : "FFFFFF";
      certRows.push(new TableRow({
        children: vals.map((v, ci) =>
          new TableCell({
            borders, width: { size: certColWidths[ci], type: WidthType.DXA },
            shading: { fill: rowShading, type: ShadingType.CLEAR },
            margins: { top: 50, bottom: 50, left: 80, right: 80 },
            children: [new Paragraph({ children: [new TextRun({ text: v, size: 18, bold: ci === 0, font: "Calibri" })] })]
          })
        )
      }));
    });

    page3.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: certColWidths,
      rows: certRows
    }));

    // ==================== PAGE 4: LICENSE VERIFICATION ====================
    const page4 = [];
    if (companyName) {
      page4.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: `${companyName.toUpperCase()} — LICENSE VERIFICATION`, bold: true, size: 24, color: BLUE, font: "Calibri" })],
        spacing: { after: 120 }
      }));
    }
    page4.push(new Paragraph({
      children: [new TextRun({ text: `License Verification for ${name}`, size: 24, bold: true, font: "Calibri" })],
      spacing: { after: 160 }
    }));

    allLicenses.forEach((lic, i) => {
      const titleRuns = [new TextRun({ text: `${lic.state || ''} — ${lic.type || 'RN'}`, bold: true, size: 22, font: "Calibri" })];
      if (lic.compact) titleRuns.push(new TextRun({ text: '  (COMPACT)', bold: true, size: 18, color: "16a34a", font: "Calibri" }));
      page4.push(new Paragraph({ children: titleRuns, spacing: { before: i > 0 ? 160 : 0, after: 40 } }));
      if (lic.licenseNumber) page4.push(new Paragraph({ children: [new TextRun({ text: `License #: ${lic.licenseNumber}`, size: 20, font: "Calibri" })], indent: { left: 240 }, spacing: { after: 20 } }));
      if (lic.issueDate) page4.push(new Paragraph({ children: [new TextRun({ text: `Issue Date: ${lic.issueDate}`, size: 20, color: GRAY, font: "Calibri" })], indent: { left: 240 }, spacing: { after: 20 } }));
      if (lic.expirationDate) page4.push(new Paragraph({ children: [new TextRun({ text: `Expiration: ${lic.expirationDate}`, size: 20, color: GRAY, font: "Calibri" })], indent: { left: 240 }, spacing: { after: 20 } }));
    });

    if (additionalData?.nursysLink) {
      page4.push(new Paragraph({
        children: [
          new TextRun({ text: "Nursys Verification Link: ", bold: true, size: 20, font: "Calibri" }),
          new TextRun({ text: additionalData.nursysLink, size: 20, color: "2563eb", font: "Calibri" }),
        ],
        spacing: { before: 200 }
      }));
    }

    // ==================== ASSEMBLE DOCUMENT ====================
    const doc = new Document({
      styles: {
        default: {
          document: { run: { font: "Calibri", size: 22 } }
        }
      },
      numbering: {
        config: [{
          reference: "bullets",
          levels: [{
            level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
          }]
        }]
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 12240, height: 15840 },
              margin: { top: 1080, right: 1440, bottom: 1080, left: 1440 }
            }
          },
          footers: {
            default: new Footer({
              children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Profile Builder Pro  |  ", size: 14, color: "BBBBBB", font: "Calibri" }),
                  new TextRun({ text: new Date().toLocaleDateString(), size: 14, color: "BBBBBB", font: "Calibri" }),
                  new TextRun({ text: "  |  Page ", size: 14, color: "BBBBBB", font: "Calibri" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 14, color: "BBBBBB", font: "Calibri" }),
                ]
              })]
            })
          },
          children: page1
        },
        {
          properties: {
            page: {
              size: { width: 12240, height: 15840 },
              margin: { top: 1080, right: 1440, bottom: 1080, left: 1440 }
            }
          },
          children: page2
        },
        {
          properties: {
            page: {
              size: { width: 12240, height: 15840 },
              margin: { top: 1080, right: 1440, bottom: 1080, left: 1440 }
            }
          },
          children: page3
        },
        {
          properties: {
            page: {
              size: { width: 12240, height: 15840 },
              margin: { top: 1080, right: 1440, bottom: 1080, left: 1440 }
            }
          },
          children: page4
        }
      ]
    });

    const buffer = await Packer.toBuffer(doc);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${(name).replace(/[^a-zA-Z0-9 ]/g, '_')}_Profile.docx"`);
    res.status(200).send(Buffer.from(buffer));

  } catch (error) {
    console.error('DOCX Generation Error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate DOCX' });
  }
}
