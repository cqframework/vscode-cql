FROM eclipse-temurin:17-jdk

# Install Node.js 20
RUN apt-get update && apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install dependencies for headless VS Code (Electron) and general dev tools
RUN apt-get update && apt-get install -y \
    xvfb \
    libgtk-3-0 \
    libgbm1 \
    libnss3 \
    libxss1 \
    libasound2t64 \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxtst6 \
    libpango-1.0-0 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    fonts-liberation \
    git \
    sudo \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Maven
ARG MAVEN_VERSION=3.9.6
RUN curl -fsSL https://archive.apache.org/dist/maven/maven-3/${MAVEN_VERSION}/binaries/apache-maven-${MAVEN_VERSION}-bin.tar.gz \
    | tar -xzC /opt && \
    ln -s /opt/apache-maven-${MAVEN_VERSION}/bin/mvn /usr/local/bin/mvn

# Create non-root user for VS Code (GID/UID 1000 may already exist in base image)
ARG USERNAME=vscode
ARG USER_UID=1000
ARG USER_GID=$USER_UID
RUN EXISTING_GROUP=$(getent group $USER_GID | cut -d: -f1 || echo ""); \
    EXISTING_USER=$(getent passwd $USER_UID | cut -d: -f1 || echo ""); \
    if [ -n "$EXISTING_GROUP" ] && [ "$EXISTING_GROUP" != "$USERNAME" ]; then \
        groupmod -n $USERNAME $EXISTING_GROUP; \
    elif [ -z "$EXISTING_GROUP" ]; then \
        groupadd --gid $USER_GID $USERNAME; \
    fi && \
    if [ -n "$EXISTING_USER" ] && [ "$EXISTING_USER" != "$USERNAME" ]; then \
        usermod -l $USERNAME -d /home/$USERNAME -m $EXISTING_USER; \
    elif [ -z "$EXISTING_USER" ]; then \
        useradd --uid $USER_UID --gid $USER_GID -m $USERNAME; \
    fi && \
    echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME && \
    chmod 0440 /etc/sudoers.d/$USERNAME

USER $USERNAME
