import ExcelJS from "exceljs";

// Un valor que empieza con = + - @ se interpretaría como fórmula en Excel (CSV injection).
const neutralizar = (v) => {
   if (v === null || v === undefined) return "";
   const s = v instanceof Date ? v.toISOString().replace("T", " ").slice(0, 19) : String(v);
   return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

export const generarCSV = (columnas, filas) => {
   const celda = (v) => {
      const s = neutralizar(v);
      return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
   };
   const lineas = [columnas.map((c) => celda(c.titulo)).join(",")];
   for (const f of filas) lineas.push(columnas.map((c) => celda(f[c.campo])).join(","));
   // BOM para que Excel abra el UTF-8 con acentos correctos.
   return "﻿" + lineas.join("\r\n");
};

export const generarXLSX = async (columnas, filas, hoja = "Participantes") => {
   const wb = new ExcelJS.Workbook();
   const ws = wb.addWorksheet(hoja);
   ws.columns = columnas.map((c) => ({ header: c.titulo, key: c.campo, width: c.ancho ?? 20 }));
   ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
   ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF01A982" } };
   for (const f of filas) ws.addRow(Object.fromEntries(columnas.map((c) => [c.campo, neutralizar(f[c.campo])])));
   ws.views = [{ state: "frozen", ySplit: 1 }];
   return Buffer.from(await wb.xlsx.writeBuffer());
};
