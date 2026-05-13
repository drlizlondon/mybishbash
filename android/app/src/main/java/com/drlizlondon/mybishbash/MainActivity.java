package com.drlizlondon.mybishbash;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (bridge != null) {
            bridge.setWebViewClient(new MyBishBashWebViewClient(bridge));
            bridge.getWebView().setWebViewClient(bridge.getWebViewClient());
        }
    }

    private class MyBishBashWebViewClient extends BridgeWebViewClient {
        MyBishBashWebViewClient(com.getcapacitor.Bridge bridge) {
            super(bridge);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            String host = url.getHost();
            String path = url.getPath();

            if (
                "drlizlondon.github.io".equals(host) &&
                ("/mybishbash".equals(path) || (path != null && path.startsWith("/mybishbash/")))
            ) {
                return false;
            }

            if ("data".equals(url.getScheme()) || "blob".equals(url.getScheme())) {
                return false;
            }

            try {
                startActivity(new Intent(Intent.ACTION_VIEW, url));
            } catch (ActivityNotFoundException ignored) {
            }
            return true;
        }
    }
}
