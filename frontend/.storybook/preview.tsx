import type { Preview } from "@storybook/nextjs-vite";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import "../src/app/globals.css";
import "../src/app/workspace-refresh.css";
import "../src/app/product-ui.css";

const preview: Preview = {
  decorators: [
    (Story) => (
      <Theme accentColor="jade" grayColor="slate" radius="large" scaling="100%">
        <main style={{ minHeight: "100vh", padding: "2rem" }}>
          <Story />
        </main>
      </Theme>
    ),
  ],
  parameters: {
    a11y: {
      test: "todo",
    },
    controls: {
      expanded: true,
    },
  },
};

export default preview;
