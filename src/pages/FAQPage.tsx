import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function FAQPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center mb-6 md:mb-8">
        <h1 className="text-2xl md:text-4xl font-bold mb-2">Frequently Asked Questions</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Common questions and answers about Stremio Account Manager
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Is this an official Stremio tool?</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              No. This is an unofficial tool and is not affiliated with Stremio in any way. Use it
              at your own risk.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What is this tool for?</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              This tool is designed for <strong>bulk Stremio account and addon management</strong>.
              It allows you to manage multiple Stremio accounts, install and remove addons across
              accounts, and sync configurations. This tool is{' '}
              <strong>not related to specific addons in any way, shape, or form</strong> - it is
              purely a management interface for your Stremio accounts and their addon
              configurations.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What risks are involved?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-muted-foreground">
              <p>Using it may break your Stremio profile or cause unexpected behavior.</p>
              <p>
                There is currently no way to 'reset' your addons to previous configurations or
                default configurations. We recommend exporting your configuration before making
                changes so you can restore it if needed.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Where is my data stored?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-muted-foreground">
              <p>
                Your accounts and saved addons are stored in a Cloudflare D1 database tied to the
                email and password you sign up with. That means you can log in from any browser or
                device and see the same data — no more losing everything when you clear your browser
                cache.
              </p>
              <p>
                Requests to addons (manifest fetches, install/remove) still go directly from your
                browser to the addon's host and to Stremio's official API. Our backend only handles
                your account data.
              </p>
              <p>
                You can still use the import/export feature to keep an offline JSON backup of your
                configuration.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How are my credentials protected?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-muted-foreground">
              <p>
                <strong>Your app password</strong> (the one you use to log into this tool) is never
                stored in plain text. It's hashed with PBKDF2-SHA256 (600,000 iterations) before
                being saved, and only the hash is kept on the server.
              </p>
              <p>
                <strong>Sessions</strong> use an opaque random token stored in an HttpOnly, Secure,
                SameSite=Strict cookie. JavaScript on the page can't read it, so an XSS bug can't
                steal your session.
              </p>
              <p>
                <strong>Stremio auth keys and debrid API keys</strong> are stored as plain columns
                in the D1 database, which Cloudflare encrypts at rest. They're served back over
                HTTPS only to your authenticated session. This is sufficient for a personal tool; if
                you have a stricter threat model, run your own instance.
              </p>
              <p>
                <strong>Best practices:</strong>
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Use a strong, unique password (8+ characters minimum)</li>
                <li>Store it in a password manager</li>
                <li>Log out from shared devices when you're done</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Can I view the source code?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-muted-foreground">
              <p>
                Absolutely! This project is fully open source and available on GitHub. You can view,
                audit, and even contribute to the code.
              </p>
              <p>
                <strong>Repository:</strong>{' '}
                <a
                  href="https://github.com/Asymons/stremio-account-manager"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  https://github.com/Asymons/stremio-account-manager
                </a>
              </p>
              <p>
                We encourage you to review the code to verify that there's no hidden functionality,
                malicious code, or data collection happening. Transparency is important to us, and
                we want you to feel confident about using this tool.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Can I use this to move Cinemeta catalogs from the top?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-muted-foreground">
              <p>
                Yes! This will allow you to move the Cinemeta provided catalogs (i.e., Popular -
                Series/Movie and Featured - Series/Movie) from the top of your catalog list.
              </p>
              <p>
                Do note that the in-built 'Continue watching' catalog cannot be moved from the top.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Why can't protected addons be removed?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-muted-foreground">
              <p>
                Protected addons are essential for Stremio's core functionality. For example,
                Cinemeta provides the metadata and catalog system that Stremio relies on. Removing
                these addons would break critical features of your Stremio profile, which is why
                they cannot be removed.
              </p>
              <p>
                <strong>However</strong>, for Cinemeta specifically, you can customize its behavior
                using the built-in configuration feature. Click the "Configure" button on the
                Cinemeta addon card to:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Remove search artifacts (search catalogs and search functionality)</li>
                <li>Remove standard catalogs (Popular, New, Featured)</li>
                <li>Remove the metadata resource</li>
              </ul>
              <p>
                This allows you to reduce Cinemeta's presence without breaking Stremio's core
                functionality. You can always reset Cinemeta to its original configuration using the
                "Reset to Original" button in the configuration dialog.
              </p>
              <p>
                For other protected addons, a reasonable alternative is to move the addon to the
                bottom of the list; however, there could be unexpected issues with this approach,
                although these haven't been observed yet in normal usage.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How do I get my AuthKey?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-muted-foreground">
              <p>
                Your AuthKey is a unique identifier that allows this tool to access your Stremio
                account and manage your addons. You can retrieve it directly from your browser's
                local storage when you're logged into Stremio's web interface.
              </p>
              <p>
                <strong>Note:</strong> Using your username and password is the easier option (and
                what we personally recommend), as it doesn't require accessing the developer
                console. However, if you don't feel comfortable entering your password, you can use
                your AuthKey instead by following the instructions below.
              </p>
              <p>
                <strong>Step-by-step instructions:</strong>
              </p>
              <ol className="list-decimal list-inside space-y-3 ml-2">
                <li>
                  <strong>Log into Stremio:</strong> Open your web browser and navigate to{' '}
                  <a
                    href="https://web.stremio.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    https://web.stremio.com/
                  </a>
                  . Make sure you're logged into your Stremio account.
                </li>
                <li>
                  <strong>Open the Developer Console:</strong> While on the Stremio website, open
                  your browser's developer console. The browser developer console is a tool which
                  logs the information associated with a web application, such as network requests
                  and errors. It also allows you to interact with the loaded web page using
                  JavaScript. Most modern browsers have a developer console built in.
                  <div className="mt-2 space-y-1">
                    <p className="font-medium">To open the developer console:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>
                        <strong>Chrome/Edge:</strong> Press{' '}
                        <kbd className="bg-muted px-1.5 py-0.5 rounded text-xs">F12</kbd> or{' '}
                        <kbd className="bg-muted px-1.5 py-0.5 rounded text-xs">Ctrl+Shift+I</kbd>{' '}
                        (Windows/Linux) or{' '}
                        <kbd className="bg-muted px-1.5 py-0.5 rounded text-xs">Cmd+Option+I</kbd>{' '}
                        (Mac)
                      </li>
                      <li>
                        <strong>Firefox:</strong> Press{' '}
                        <kbd className="bg-muted px-1.5 py-0.5 rounded text-xs">F12</kbd> or{' '}
                        <kbd className="bg-muted px-1.5 py-0.5 rounded text-xs">Ctrl+Shift+K</kbd>{' '}
                        (Windows/Linux) or{' '}
                        <kbd className="bg-muted px-1.5 py-0.5 rounded text-xs">Cmd+Option+K</kbd>{' '}
                        (Mac)
                      </li>
                      <li>
                        <strong>Safari:</strong> Enable "Show Develop menu" in Preferences, then
                        press{' '}
                        <kbd className="bg-muted px-1.5 py-0.5 rounded text-xs">Cmd+Option+C</kbd>
                      </li>
                    </ul>
                  </div>
                </li>
                <li>
                  <strong>Run the command:</strong> In the console, you'll see a prompt where you
                  can type commands. Copy and paste the following command exactly as shown:
                  <div className="mt-2 p-3 bg-muted rounded-md">
                    <code className="text-sm">
                      JSON.parse(localStorage.getItem("profile")).auth.key
                    </code>
                  </div>
                  Press{' '}
                  <kbd className="bg-background border px-1.5 py-0.5 rounded text-xs">Enter</kbd> to
                  execute the command.
                </li>
                <li>
                  <strong>Copy your AuthKey:</strong> The console will display your AuthKey as a
                  string of characters (it will look something like a long alphanumeric code).
                  Select and copy this entire value. Be careful to copy the complete key - it should
                  be quite long.
                </li>
                <li>
                  <strong>Paste into the AuthKey field:</strong> Return to this application, click
                  "Add Account", select the "Auth Key" option, and paste the copied value into the
                  AuthKey field.
                </li>
              </ol>
              <p className="pt-2">
                <strong>Note:</strong> Your AuthKey is sensitive information that provides access to
                your Stremio account. Keep it secure and never share it with others. This tool
                stores your AuthKey on its backend, scoped to your logged-in account, so you can
                access it from any device after signing in.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How do import and backups work?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-muted-foreground">
              <p>
                The import/export feature allows you to save and restore your account configurations
                and saved addons. When you export, you'll receive a JSON file containing all your
                data.
              </p>
              <p>You can use this file to:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Backup your configurations before making changes</li>
                <li>Transfer your setup to another browser or device</li>
                <li>Restore your configuration if something goes wrong</li>
              </ul>
              <p>
                To import, simply use the Import button and select a previously exported JSON file.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
