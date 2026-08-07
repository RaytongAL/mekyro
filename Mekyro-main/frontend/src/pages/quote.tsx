import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SiteViewModeToggle } from "@/components/site-view-mode-toggle";
import { isOfficialLocale } from "@/lib/official-site/content";

const expectedQuote = {
  buyerId: "buyer_global_retail_fr",
  capabilityToken: "cap_quote_alpha_full_payment",
  quoteToken: "quote_alpha_full_payment",
};

export function QuotePage() {
  const { i18n, t } = useTranslation();
  const { quoteToken } = useParams();
  const [searchParams] = useSearchParams();
  const buyerId = searchParams.get("buyerId");
  const capabilityToken = searchParams.get("capabilityToken");
  const urlLocale = searchParams.get("locale");
  const locale = isOfficialLocale(urlLocale)
    ? urlLocale
    : i18n.language.startsWith("en")
      ? "en-US"
      : "zh-CN";
  const isAuthorized =
    quoteToken === expectedQuote.quoteToken &&
    buyerId === expectedQuote.buyerId &&
    capabilityToken === expectedQuote.capabilityToken;

  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <main className="buyer-secure-link">
      <header className="buyer-link-nav">
        <a href="/">Mekyro</a>
        <nav aria-label="交易进度">
          {["Catalog", "Inquiry", "Quote", "Payment", "Track"].map((item) => (
            <span className={item === "Quote" ? "is-active" : ""} key={item}>
              {item}
            </span>
          ))}
        </nav>
      </header>

      {isAuthorized ? (
        <>
          <section className="buyer-link-hero">
            <span>Secure quote</span>
            <h1>Quote Page</h1>
            <p>Alpha Refurb Supply for Paris Mobile Retail</p>
          </section>

          <section className="buyer-quote-grid">
            <article className="buyer-quote-card buyer-quote-card-primary">
              <span>Quote snapshot</span>
              <h2>iPhone 13 CPO mixed grade</h2>
              <dl>
                <div>
                  <dt>Quantity</dt>
                  <dd>20 units</dd>
                </div>
                <div>
                  <dt>Unit price</dt>
                  <dd>$400</dd>
                </div>
                <div>
                  <dt>Total</dt>
                  <dd>$8,000</dd>
                </div>
              </dl>
            </article>

            <article className="buyer-quote-card">
              <span>Payment</span>
              <h2>Full payment requested</h2>
              <p>Payment and order steps continue from this secure buyer link. Buyer account login is not required.</p>
            </article>

            <article className="buyer-quote-card">
              <span>Fulfillment</span>
              <h2>Ready for confirmation</h2>
              <p>Logistics details, final packaging evidence, and tracking updates are handled in the transaction context.</p>
            </article>
          </section>
        </>
      ) : (
        <section className="buyer-link-hero buyer-link-denied">
          <span>Secure quote</span>
          <h1>{t("quote.linkUnavailable")}</h1>
          <p>{t("quote.linkUnavailableText")}</p>
        </section>
      )}
      <footer className="buyer-link-footer">
        <SiteViewModeToggle locale={locale} />
      </footer>
    </main>
    </>
  );
}
