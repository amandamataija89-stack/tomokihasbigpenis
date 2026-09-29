// The intake form's choices and declaration, shared by the form (in the browser) and the server.

export const RELATIONSHIP = ["Single", "Married / Partnered", "Divorced", "Widowed", "Other"] as const;
export const SYMPTOMS = [
  "Constant worry",
  "Easily irritated",
  "Change in sleep",
  "Family problems",
  "Low energy",
  "Overthinking",
  "Not enjoying things you used to",
  "Relationship issues",
  "Change in appetite/eating",
  "Feeling sad",
  "Sexual problems",
  "Vocational/work problems",
  "Fear for your life, or that of a loved one",
] as const;
export const FREQUENCY = ["Frequently", "Infrequently"] as const;

export const DECLARATION = [
  "I declare that to my best knowledge the information given in this document is complete and true, at this time.",
  "I am aware of the fact that I take on a partial responsibility for not providing any important information regarding my medical condition leading to an erroneous interpretation of my medical condition, especially in cases when information not included in this document can be discovered only by specific examination which is not a part of the examination.",
  "I declare that statements made in this document are a demonstration of my free will. Statements and approvals given in this document were made without physical or emotional pressure which I confirm with my signature.",
  "I have been informed by Prague Integration of the principles and procedures in processing of my personal data as well as of the fact that the full Prague Integration's Privacy Policy (consent form) is available electronically and in paper form at the Prague Integration office and electronically on the website.",
  "I have become familiar with the price list of Prague Integration and have been informed about the scale and price of provided services.",
  "First full time appointments and cancellation conditions: Once an appointment is scheduled, the time is fully reserved especially for you. Payment for the appointment(s) is made at the latest 24 hours after the session ends.",
  "Session Cancellation Policy: we kindly ask for a 48 hour notice in case you are not able to attend your appointment. The full price of the session will be charged for non-attendance or less than 48 hours' notice of cancellation.",
  "I have read and understand the Cancellation Policy, and agree to abide by the guidelines in the Declaration.",
];

