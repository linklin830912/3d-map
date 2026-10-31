FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Install the build tools and vcpkg prerequisites
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    ninja-build \
    curl \
    zip \
    unzip \
    tar \
    pkg-config \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install vcpkg inside the Docker image
WORKDIR /opt

RUN git clone https://github.com/microsoft/vcpkg.git \
    && ./vcpkg/bootstrap-vcpkg.sh

# Copy the backend source code
WORKDIR /app

COPY vcpkg.json CMakeLists.txt ./
COPY src ./src

# Install dependencies and compile
RUN cmake -S . -B build \
    -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE=/opt/vcpkg/scripts/buildsystems/vcpkg.cmake \
    -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build

EXPOSE 3000

CMD ["./build/map_server"]