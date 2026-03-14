/**
 * Formats a date as a readable string in "Month Day, Year" format.
 *
 * @param input - A date string or timestamp to format.
 * @returns A string formatted as "Month Day, Year".
 */
export function formatDate(input: Date | string | number): string {
  const date = new Date(input);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Formats a date and time as a readable string in "Month Day, Year, Hour:Minute AM/PM" format.
 *
 * @param input - A date string or timestamp to format.
 * @returns A string formatted as "Month Day, Year, Hour:Minute AM/PM".
 */
export function formatDateTime(input: Date | string | number): string {
  const date = new Date(input);
  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  });
}

/**
 * Formats a number as a currency string.
 *
 * @param amount - The numeric value to format as currency.
 * @param currency - The currency code. Defaults to "USD".
 * @param locale - The locale for formatting. Defaults to "en-US".
 * @returns A currency-formatted string.
 */
export function formatCurrency(
  amount: number,
  currency: string = "USD",
  locale: string = "en-US"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amount);
}

/**
 * Constructs an absolute URL based on the configured public app URL.
 *
 * @param path - The relative path to append to the base URL.
 * @returns An absolute URL string.
 */
export function absoluteUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}${path}`;
}

/**
 * Normalizes a media path so it can be used as an app-relative URL.
 *
 * @param path - The relative media path.
 * @returns A normalized app-relative URL.
 */
export function toAbsoluteUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `/${cleanPath}`;
}

/**
 * Returns the supported time zones with formatted GMT offsets.
 *
 * @returns A sorted list of time zone labels and values.
 */
export const getTimeZones = (): { label: string; value: string }[] => {
  const timezones = Intl.supportedValuesOf("timeZone");

  return timezones
    .map((timezone) => {
      const formatter = new Intl.DateTimeFormat("en", {
        timeZone: timezone,
        timeZoneName: "shortOffset",
      });
      const parts = formatter.formatToParts(new Date());
      const offset = parts.find((part) => part.type === "timeZoneName")?.value || "";
      const formattedOffset = offset === "GMT" ? "GMT+0" : offset;

      return {
        value: timezone,
        label: `(${formattedOffset}) ${timezone.replace(/_/g, " ")}`,
        numericOffset: parseInt(
          formattedOffset.replace("GMT", "").replace("+", "") || "0"
        ),
      };
    })
    .sort((a, b) => a.numericOffset - b.numericOffset);
};
