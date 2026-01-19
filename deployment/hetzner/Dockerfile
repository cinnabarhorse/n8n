# Custom n8n Dockerfile with AI Builder enabled
# This builds from the modified source code

ARG NODE_VERSION=22.21.1

FROM n8nio/base:${NODE_VERSION}

ENV NODE_ENV=production
ENV NODE_ICU_DATA=/usr/local/lib/node_modules/full-icu
ENV SHELL=/bin/sh

WORKDIR /home/node

# Copy the compiled n8n application
COPY ./compiled /usr/local/lib/node_modules/n8n
COPY docker/images/n8n/docker-entrypoint.sh /

RUN cd /usr/local/lib/node_modules/n8n && \
    npm rebuild sqlite3 && \
    ln -s /usr/local/lib/node_modules/n8n/bin/n8n /usr/local/bin/n8n && \
    mkdir -p /home/node/.n8n && \
    chown -R node:node /home/node && \
    rm -rf /root/.npm /tmp/*

EXPOSE 5678/tcp
USER node
ENTRYPOINT ["tini", "--", "/docker-entrypoint.sh"]

LABEL org.opencontainers.image.title="n8n-ai-builder" \
      org.opencontainers.image.description="n8n with AI Workflow Builder enabled"
