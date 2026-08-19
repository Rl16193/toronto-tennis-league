declare module 'mailcheck' {
  export type MailcheckSuggestion = {
    address: string;
    domain: string;
    full: string;
  };

  export type MailcheckOptions = {
    email: string;
    suggested?: (suggestion: MailcheckSuggestion) => void;
    empty?: () => void;
  };

  const mailcheck: {
    run(options: MailcheckOptions): false | MailcheckSuggestion | void;
  };

  export default mailcheck;
}
