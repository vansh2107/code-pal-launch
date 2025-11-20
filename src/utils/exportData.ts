interface Document {
  id: string;
  name: string;
  document_type: string;
  issuing_authority?: string;
  expiry_date: string;
  renewal_period_days?: number;
  notes?: string;
  created_at: string;
}

export const exportToCSV = (documents: Document[]) => {
  const headers = [
    "Name",
    "Type",
    "Issuing Authority",
    "Expiry Date",
    "Renewal Period (Days)",
    "Notes",
    "Created At",
  ];

  const rows = documents.map((doc) => [
    doc.name,
    doc.document_type,
    doc.issuing_authority || "",
    doc.expiry_date,
    doc.renewal_period_days?.toString() || "30",
    doc.notes || "",
    new Date(doc.created_at).toLocaleDateString(),
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${cell.toString().replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", `documents_${new Date().toISOString().split("T")[0]}.csv`);
  link.style.visibility = "hidden";
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const exportToJSON = (documents: Document[]) => {
  const jsonContent = JSON.stringify(documents, null, 2);
  
  const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", `documents_${new Date().toISOString().split("T")[0]}.json`);
  link.style.visibility = "hidden";
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
