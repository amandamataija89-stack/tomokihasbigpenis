// The message a counsellor sends to offer a new private client the free discovery session. It goes on the
// client's private messages page (the email only says there's a new message).
export const discoveryOffer = (counsellor: string) => `Hello, my name is ${counsellor} and I am your mental health counsellor. I am inviting you for a free discovery session.

Discovery session: The initial online session lasts 15–20 minutes and is free of charge. If you decide to continue with counselling afterwards, sessions are billed according to our standard hourly rate and the agreement between the client and Prague Integration.

Payment & insurance: Please note that we do not accept public health insurance, and all sessions are self-paid.

Session format: Sessions can be held online (Zoom/Google Meet) or in person. The discovery session is always online, while all following sessions can be held online or in person, based on your preference and agreement with your counsellor. Our office is at Mezibranská 4, 110 00 Prague; some counsellors can also meet you at their own office.

Further steps: If you choose to continue with ongoing sessions, we will send you a consent form to review and sign, along with the payment details.

Questions: If you have any questions, please feel free to reply here. To book your discovery session, reply with a few days and times that suit you.

Please note: If your counsellor does not respond within 24 hours, we will assign you another counsellor for the discovery session to avoid any delays.

Warm regards,
${counsellor}
Prague Integration`;
