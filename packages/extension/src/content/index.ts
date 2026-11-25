import type { ContentRequest } from "../messages.js";
import { detectPage, insertNote, patientIdOnPage, readPreviousNotes, readSchedule } from "./jane.js";

// Runs only on Jane pages (see manifest). It reads the page the clinician has open and,
// on her click, fills the note fields. It never calls Jane's internal APIs and never
// opens other patients' charts.
chrome.runtime.onMessage.addListener((msg: ContentRequest, _sender, reply) => {
  const url = location.href;
  switch (msg.type) {
    case "page":
      reply(detectPage(url));
      break;
    case "readSchedule":
      reply(readSchedule(document));
      break;
    case "readChart":
      reply({ patientId: patientIdOnPage(document, url), previousNotes: readPreviousNotes(document, msg.limit) });
      break;
    case "insert":
      reply(insertNote(document, url, msg.expectedPatientId, msg.text));
      break;
  }
  return false;
});
